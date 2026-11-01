# Deploying LedgerLens to Azure (free tier)

Everything below stays within free tiers on a new Azure free account. Allow about 20 minutes.

## What gets created

`infra/` is a Terraform configuration that creates one resource group in Southeast Asia with:

| Resource | Tier |
| --- | --- |
| Container Apps environment, web app and worker job | Consumption (monthly free grant) |
| AI Document Intelligence | F0 (free) |
| Cosmos DB for MongoDB account, database and 3 collections | Free tier, 400 RU/s shared |
| Storage account with a `documents` container and queue | Standard LRS, 7-day delete rule |
| Log Analytics workspace | Pay-as-you-go with a 0.15 GB daily cap (under the 5 GB free) |
| Two user-assigned managed identities and their role assignments | Free |

**Check first:** a subscription can have only **one** Cosmos DB free-tier account, and Azure typically
refuses a second free (F0) Document Intelligence resource in the same subscription. If yours already has
either, delete the old one or change the tier in `infra/main.tf` before applying, otherwise the apply
fails or that service is billed.

## 1. Publish the image

1. Push the repository to GitHub as `Zebbb01/ledgerlens` (or change `github_repo` and `image` in
   `infra/variables.tf`).
2. Merge a release into `main`. The **Deploy** workflow builds the image and pushes it to
   `ghcr.io/zebbb01/ledgerlens`. Its Azure step is skipped until step 3 is done.
3. Make the image public, so Container Apps can pull it without credentials: GitHub → your profile →
   **Packages** → `ledgerlens` → **Package settings** → **Change visibility** → **Public**.

## 2. Create the Azure resources

Open [Azure Cloud Shell](https://shell.azure.com) in Bash. Terraform and the Azure CLI are already
there, so nothing needs installing. When Cloud Shell asks about storage, mount a file share if you want
the Terraform state kept between sessions (a free account's 12-month allowance covers it); otherwise run
the same commands on your own machine after installing the Azure CLI and Terraform.

```bash
git clone https://github.com/Zebbb01/ledgerlens.git
cd ledgerlens/infra
terraform init
terraform apply
```

Optional: turn on category suggestions with a GitHub token that has the `models:read` permission:
`terraform apply -var "llm_api_key=github_pat_..."`.

Keep the Terraform state (`terraform.tfstate`): it is how you update or remove the resources later.

## 3. Connect GitHub Actions

```bash
terraform output github_variables
```

Add each value as a repository **variable** (not a secret; none of them is sensitive): GitHub →
**Settings** → **Secrets and variables** → **Actions** → **Variables**. From now on every push to `main`
rolls the new image out to the web app and the worker, signing in to Azure with OpenID Connect.

## 4. Check it

```bash
terraform output app_url
```

Open the URL and run the **VAT invoice** sample. The first request after a quiet spell wakes the app
(a few seconds), and the worker starts from zero when a document arrives, so the first result can take
up to a minute.

To see what the worker did, open the Log Analytics workspace → **Logs** and run:

```kusto
ContainerAppConsoleLogs_CL
| where Log_s has "document.processed"
| project TimeGenerated, Log_s
| order by TimeGenerated desc
```

To score extraction against the sample answer keys with the real service, from a machine where you are
signed in with `az login`:

```bash
DI_ENDPOINT=$(terraform -chdir=infra output -raw document_intelligence_endpoint) npm run eval
```

## Remove everything

```bash
cd ledgerlens/infra
terraform destroy
```
