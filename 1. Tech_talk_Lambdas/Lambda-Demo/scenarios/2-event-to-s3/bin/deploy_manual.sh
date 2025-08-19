#!/bin/bash

sam_build() {
    do_dockerized_build=0
    while getopts ":d" opt; do
        case ${opt} in
        d)
            do_dockerized_build=1
            ;;
        ?)  
            printf "Usage: $0 %s: [-d] args\n"
            exit 2
            ;;
        esac
    done
    if [[ "${do_dockerized_build}" -eq "1" ]]; then
        return $?
    fi
    sam build --cached --region us-east-1 --profile $AWS_PROFILE
}

if ! which sam ; then
    echo "sam not found"
    exit 1
fi

# VARIABLES ESTANDAR
ENV=dev
AWS_ACCOUNT=apps
AWS_PROFILE=default
SOURCE="$(pwd)"
APP_NAME=pruebasns
PRODUCT=pruebasns
STACK=srvless-pruebasns
## Cuenta AWS APP-DEV
BUCKET=spv-$ENV-srvless-deploy
LAMBDA_NAME=pruebasns

echo 'Building SAM package and uploading CloudFormation templates'
sam_build "$@"
sam deploy --region us-east-1 --profile $AWS_PROFILE --stack-name $STACK --s3-bucket $BUCKET \
--tags Environment=$ENV ProductName=$PRODUCT AppName=$APP_NAME \
--capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND CAPABILITY_NAMED_IAM \
--parameter-overrides Account=$AWS_ACCOUNT Environment=$ENV AppName=$APP_NAME \
 LambdaName=$LAMBDA_NAME \
