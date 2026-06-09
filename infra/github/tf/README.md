# GitHub + AWS Bootstrap (Terraform, run locally)

This Terraform project provisions everything needed to deploy the BLE demo's
SAM stack from GitHub Actions:

- **GitHub repository** (public) — `var.github_owner/var.github_repo`
- **AWS OIDC provider** for `token.actions.githubusercontent.com`
- **IAM role** (`ble-demo-github-actions-role`) that GitHub Actions assumes
  via OIDC; trust policy locks it to pushes on `var.deploy_branch`
- **S3 bucket** + **DynamoDB lock table** for Terraform state and SAM artifacts
- **GitHub Actions repository variables** wired into the new repo so the
  workflow can read role ARN, region, and artifact bucket without manual setup

State is **local** — this is a one-shot bootstrap. After this runs, push the
project (including `.github/workflows/deploy.yml`) to the new repo and CI takes
over the rest.

## Prerequisites

- Terraform ≥ 1.7
- AWS CLI configured with a `default` profile that has admin in ap-southeast-1
- A GitHub Personal Access Token in the environment:
  ```bash
  export GITHUB_TOKEN=ghp_...   # scopes: repo, workflow, delete_repo (optional)
  ```

## Usage

```bash
cd infra/github/tf
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars — set github_owner and a unique state_bucket_name

terraform init
terraform plan
terraform apply
```

After apply, note the outputs (`deploy_role_arn`, `github_repo_url`, etc.).
The repository variables are already populated; the workflow will pick them up
automatically on first push.

## Pushing the codebase

The Terraform run only creates the empty repo. Push the rest of the project:

```bash
cd ../../..                                 # back to mini-program-demo/
git init -b main
git add .
git commit -m "initial commit"
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

The `deploy` workflow will run on first push.

## Teardown

`prevent_destroy` guards the state bucket and lock table — comment those out
before `terraform destroy` if you really mean it.
