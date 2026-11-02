variable "location" {
  description = "Azure region. Southeast Asia is closest to the Philippines and offers every service used here."
  type        = string
  default     = "southeastasia"
}

variable "name_prefix" {
  description = "Prefix for resource names; a random suffix keeps global names unique."
  type        = string
  default     = "ledgerlens"
}

variable "image" {
  description = "Container image for the web app and the worker. The deploy workflow replaces it on each release."
  type        = string
  default     = "ghcr.io/zebbb01/ledgerlens:latest"
}

variable "github_oidc_subject_prefix" {
  description = "Start of the subject GitHub puts in the repository's OpenID Connect tokens. New repositories use immutable IDs (repo:OWNER@OWNER_ID/REPO@REPO_ID); print yours with: gh api repos/OWNER/REPO/actions/oidc/customization/sub"
  type        = string
  default     = "repo:Zebbb01@179115543/ledgerlens@1442479905"
}

variable "monthly_page_cap" {
  description = "Pages the app may send to Document Intelligence per month. The free tier allows 500."
  type        = number
  default     = 450
}

variable "alert_email" {
  description = "Email for the cost alert (a 1-unit monthly budget that warns at the first cent spent). Empty skips the alert."
  type        = string
  default     = ""
}

variable "llm_api_key" {
  description = "Optional key for the category suggestion model (a GitHub token with models:read for GitHub Models). Empty turns the feature off."
  type        = string
  default     = ""
  sensitive   = true
}
