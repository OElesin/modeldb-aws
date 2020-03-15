#!/usr/bin/env node
import 'source-map-support/register';
import {VpcStack} from './lib/vpc-stack';
// import {ECSStack} from './lib/ecs-stack';
import {RDSStack} from './lib/rds-stack';
import cdk = require('@aws-cdk/core');

const app = new cdk.App();

const vpcResource = new VpcStack(app, 'VpcStack', );
new RDSStack(app, 'ModelDbRDSStack', {
    vpc: vpcResource.vpc,
    username: 'postgres',
    databaseName: 'postgres',
    port: 5432,
});


// new ECSStack(app, 'ModelDbECSClusterStack', {
//     vpc: vpcResource.vpc,
//     dbUsername: 'postgres'
// });