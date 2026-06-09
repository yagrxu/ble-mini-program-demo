# Creates the public GitHub repository and configures the secret/variable
# that the deploy workflow needs to assume the AWS role via OIDC.

resource "github_repository" "this" {
  name        = var.github_repo
  description = var.github_repo_description
  visibility  = "public"

  has_issues   = true
  has_wiki     = false
  has_projects = false

  auto_init = false

  topics = ["wechat", "miniprogram", "ble", "bluetooth", "aws", "serverless"]
}

# Repository variable (non-secret) — readable in workflow logs.
resource "github_actions_variable" "aws_region" {
  repository    = github_repository.this.name
  variable_name = "AWS_REGION"
  value         = var.aws_region
}

resource "github_actions_variable" "aws_deploy_role_arn" {
  repository    = github_repository.this.name
  variable_name = "AWS_DEPLOY_ROLE_ARN"
  value         = aws_iam_role.github_actions.arn
}

resource "github_actions_variable" "sam_artifacts_bucket" {
  repository    = github_repository.this.name
  variable_name = "SAM_ARTIFACTS_BUCKET"
  value         = aws_s3_bucket.terraform_state.id
}
