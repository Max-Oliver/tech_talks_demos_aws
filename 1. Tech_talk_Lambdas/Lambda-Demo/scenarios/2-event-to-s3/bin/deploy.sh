#!/bin/bash
if ! which sam ; then
echo "sam not found"
exit 1
fi


echo 'Building SAM package and uploading cloudformation'

sam build --region us-east-1 --use-container --base-dir '#base_dir#' \
--container-env-var ARTIFACTORY_USER=$ARTIFACTORY_USER  --container-env-var ARTIFACTORY_PASS=$ARTIFACTORY_PASS

sam package --region us-east-1 --s3-bucket '#bucket#'

sam deploy --region us-east-1 --stack-name '#stack_name#' --s3-bucket='#bucket#' \
--tags Environment='#env#' ProductName='#product#' '#git_tags#' --capabilities CAPABILITY_NAMED_IAM \
--parameter-overrides Environment='#env#' Account='#aws_account#' AppName='#app_name#' '#extra_params#' --no-fail-on-empty-changeset