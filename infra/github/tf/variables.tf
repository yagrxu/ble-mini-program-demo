variable "project_name" {
  type        = string
  description = "Project name used for resource naming"
  default     = "ble-demo"
}

variable "aws_profile" {
  type        = string
  description = "AWS CLI profile to use for provisioning"
  default     = "default"
}

variable "aws_region" {
  type        = string
  description = "AWS region for the SAM stack and state backend"
  default     = "ap-southeast-1"
}

variable "github_owner" {
  type        = string
  description = "GitHub user or org that will own the repository"
}

variable "github_repo" {
  type        = string
  description = "Name of the GitHub repository to create"
  default     = "ble-mini-program-demo"
}

variable "github_repo_description" {
  type        = string
  description = "Description shown on the GitHub repository page"
  default     = "WeChat mini program demo for BLE, with an AWS serverless backend (API Gateway + Lambda + DynamoDB + WAF)."
}

variable "deploy_branch" {
  type        = string
  description = "Branch whose pushes trigger production deployment"
  default     = "main"
}

variable "state_bucket_name" {
  type        = string
  description = "S3 bucket name for Terraform remote state of the SAM-deployed app (must be globally unique)"
}

variable "lock_table_name" {
  type        = string
  description = "DynamoDB table name for Terraform state locking"
  default     = "ble-demo-terraform-locks"
}

variable "tags" {
  type        = map(string)
  description = "Common tags for all AWS resources"
  default = {
    Project   = "ble-demo"
    ManagedBy = "terraform"
    Component = "oidc-bootstrap"
  }
}
