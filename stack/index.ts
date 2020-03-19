#!/usr/bin/env node
import 'source-map-support/register';
import {VpcStack} from './lib/vpc-stack';
import {RDSStack} from './lib/rds-stack';
import {ECSStack} from './lib/ecs-stack';
import cdk = require('@aws-cdk/core');

const app = new cdk.App();

const vpcStack = new VpcStack(app, 'ml-base-infra-stack', );

const rdsStack = new RDSStack(app, 'modeldb-rds-stack', {
    vpc: vpcStack.vpc,
    username: 'postgres',
    databaseName: 'postgres',
    port: 5432,
});
rdsStack.addDependency(vpcStack);

const ecsStack = new ECSStack(app, 'modeldb-ecs-cluster-stack', {
    vpc: vpcStack.vpc,
    dbUsername: 'postgres'
});
ecsStack.addDependency(rdsStack);