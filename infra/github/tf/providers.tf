terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Bootstrap project — uses LOCAL state intentionally.
  # Run from your laptop with `terraform apply`. Keep terraform.tfstate safe.
}

provider "aws" {
  profile = var.aws_profile
  region  = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# Reads $GITHUB_TOKEN from environment.
# Token needs scopes: `repo` (create/manage repo) and `workflow` (push workflow files).
provider "github" {
  owner = var.github_owner
}
