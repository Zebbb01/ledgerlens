# LedgerLens on Azure, using only free tiers and free monthly grants:
# Container Apps (consumption), Cosmos DB for MongoDB (free tier), Document
# Intelligence (F0), Storage (Blob + Queue), Log Analytics (daily cap under 5 GB/month).

terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
}

data "azurerm_client_config" "current" {}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  name    = "${var.name_prefix}-${random_string.suffix.result}"
  compact = "${replace(var.name_prefix, "-", "")}${random_string.suffix.result}"
  tags    = { app = "ledgerlens", cost = "free-tier" }

  # Shared by the web app and the queue worker.
  env = {
    MONGODB_DB            = azurerm_cosmosdb_mongo_database.main.name
    AZURE_STORAGE_ACCOUNT = azurerm_storage_account.main.name
    AZURE_CLIENT_ID       = azurerm_user_assigned_identity.app.client_id
    DI_ENDPOINT           = azurerm_cognitive_account.di.endpoint
    MONTHLY_PAGE_CAP      = tostring(var.monthly_page_cap)
  }
  secrets = merge(
    { "mongodb-uri" = azurerm_cosmosdb_account.main.primary_mongodb_connection_string },
    var.llm_api_key == "" ? {} : { "llm-api-key" = var.llm_api_key },
  )
  secret_env = merge(
    { MONGODB_URI = "mongodb-uri" },
    var.llm_api_key == "" ? {} : { LLM_API_KEY = "llm-api-key" },
  )
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name}"
  location = var.location
  tags     = local.tags
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.name}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.15 # about 4.6 GB a month, under the 5 GB free ingestion
  tags                = local.tags
}

# Uploaded files and the work queue. Files are deleted after 7 days.
resource "azurerm_storage_account" "main" {
  name                            = "st${local.compact}"
  location                        = azurerm_resource_group.main.location
  resource_group_name             = azurerm_resource_group.main.name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = local.tags
}

resource "azurerm_storage_container" "documents" {
  name                  = "documents"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

resource "azurerm_storage_queue" "documents" {
  name               = "documents"
  storage_account_id = azurerm_storage_account.main.id
}

resource "azurerm_storage_management_policy" "expire" {
  storage_account_id = azurerm_storage_account.main.id
  rule {
    name    = "delete-after-7-days"
    enabled = true
    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["documents/"]
    }
    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = 7
      }
    }
  }
}

# Free tier: the first 1000 RU/s and 25 GB are free for the life of the account
# (one free-tier account per subscription). Collections share 400 RU/s.
resource "azurerm_cosmosdb_account" "main" {
  name                 = "cosmos-${local.name}"
  location             = azurerm_resource_group.main.location
  resource_group_name  = azurerm_resource_group.main.name
  offer_type           = "Standard"
  kind                 = "MongoDB"
  free_tier_enabled    = true
  mongo_server_version = "7.0"
  tags                 = local.tags

  capabilities {
    name = "EnableMongo"
  }
  consistency_policy {
    consistency_level = "Session"
  }
  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_mongo_database" "main" {
  name                = "ledgerlens"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  throughput          = 400
}

# Every collection in a shared-throughput database needs a shard key; each one
# matches the field the app always filters on.
resource "azurerm_cosmosdb_mongo_collection" "documents" {
  name                = "documents"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_mongo_database.main.name
  shard_key           = "workspaceId"
  default_ttl_seconds = 604800 # 7 days, like the files

  index {
    keys   = ["_id"]
    unique = true
  }
  index {
    keys = ["createdAt"]
  }
}

resource "azurerm_cosmosdb_mongo_collection" "analyses" {
  name                = "analyses"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_mongo_database.main.name
  shard_key           = "sha256"

  index {
    keys   = ["_id"]
    unique = true
  }
}

resource "azurerm_cosmosdb_mongo_collection" "usage" {
  name                = "usage"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_mongo_database.main.name
  shard_key           = "key"
  default_ttl_seconds = 3456000 # 40 days: counters only matter for their day or month

  index {
    keys   = ["_id"]
    unique = true
  }
}

# Free tier F0: 500 pages a month, first two pages of each file, 4 MB per file.
# Keys are switched off; only managed identities and signed-in users get in.
resource "azurerm_cognitive_account" "di" {
  name                  = "di-${local.name}"
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  kind                  = "FormRecognizer"
  sku_name              = "F0"
  custom_subdomain_name = "di-${local.name}"
  local_auth_enabled    = false
  tags                  = local.tags
}

# One identity for the web app and the worker: no storage or service keys in config.
resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${local.name}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_role_assignment" "app_blobs" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_role_assignment" "app_queue" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Queue Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_role_assignment" "app_di" {
  scope                = azurerm_cognitive_account.di.id
  role_definition_name = "Cognitive Services User"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# Lets the person who applied this run `npm run eval` against the real service.
resource "azurerm_role_assignment" "me_di" {
  scope                = azurerm_cognitive_account.di.id
  role_definition_name = "Cognitive Services User"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.name}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  logs_destination           = "log-analytics"
  tags                       = local.tags

  # Azure now creates every environment with this serverless profile. It is
  # billed per second like the consumption plan and covered by the free grant;
  # declaring it stops Terraform from trying to remove it on each apply.
  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

# The web app scales to zero when idle and to one replica at most.
resource "azurerm_container_app" "web" {
  name                         = "ca-${local.name}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  dynamic "secret" {
    for_each = local.secrets
    content {
      name  = secret.key
      value = secret.value
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "web"
      image  = var.image
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = local.env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name        = env.key
          secret_name = env.value
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image] # the deploy workflow sets it
  }

  depends_on = [azurerm_role_assignment.app_blobs, azurerm_role_assignment.app_queue]
}

# The queue worker: KEDA starts one execution when the queue has messages, and it
# exits once the queue is empty. Idle, it costs nothing.
resource "azurerm_container_app_job" "worker" {
  name                         = "job-${local.name}"
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 600
  replica_retry_limit          = 1
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  dynamic "secret" {
    for_each = local.secrets
    content {
      name  = secret.key
      value = secret.value
    }
  }

  event_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
    scale {
      min_executions              = 0
      max_executions              = 1
      polling_interval_in_seconds = 10
      rules {
        name             = "documents-queue"
        custom_rule_type = "azure-queue"
        identity_id      = azurerm_user_assigned_identity.app.id
        metadata = {
          accountName = azurerm_storage_account.main.name
          queueName   = azurerm_storage_queue.documents.name
          queueLength = "1"
        }
      }
    }
  }

  template {
    container {
      name    = "worker"
      image   = var.image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["node", "--experimental-strip-types", "src/worker/run.ts"]

      dynamic "env" {
        for_each = local.env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name        = env.key
          secret_name = env.value
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_role_assignment.app_queue, azurerm_role_assignment.app_di]
}

# GitHub Actions signs in with OpenID Connect to roll out new images: no secret
# is stored in the repository.
resource "azurerm_user_assigned_identity" "deploy" {
  name                = "id-${local.name}-github"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "github_main" {
  name                      = "github-main"
  user_assigned_identity_id = azurerm_user_assigned_identity.deploy.id
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = "https://token.actions.githubusercontent.com"
  subject                   = "${var.github_oidc_subject_prefix}:ref:refs/heads/main"
}

resource "azurerm_role_assignment" "deploy" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
}

# A 1-unit monthly budget on the resource group: an email goes out at the first
# cent of actual cost, so a change that leaves the free tiers is noticed at once.
resource "azurerm_consumption_budget_resource_group" "guard" {
  count             = var.alert_email == "" ? 0 : 1
  name              = "budget-${local.name}"
  resource_group_id = azurerm_resource_group.main.id
  amount            = 1
  time_grain        = "Monthly"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", plantimestamp())
  }

  notification {
    enabled        = true
    threshold      = 1
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = [var.alert_email]
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}
