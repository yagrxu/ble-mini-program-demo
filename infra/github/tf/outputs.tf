output "oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "deploy_role_arn" {
  description = "ARN of the IAM role assumed by GitHub Actions"
  value       = aws_iam_role.github_actions.arn
}

output "state_bucket_name" {
  description = "S3 bucket name (also used by SAM for packaged artifacts)"
  value       = aws_s3_bucket.terraform_state.id
}

output "lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "github_repo_url" {
  description = "URL of the created GitHub repository"
  value       = github_repository.this.html_url
}

output "github_repo_clone_ssh" {
  description = "SSH clone URL"
  value       = github_repository.this.ssh_clone_url
}
