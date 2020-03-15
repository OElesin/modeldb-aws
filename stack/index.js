#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const vpc_stack_1 = require("./lib/vpc-stack");
// import {ECSStack} from './lib/ecs-stack';
const rds_stack_1 = require("./lib/rds-stack");
const cdk = require("@aws-cdk/core");
const app = new cdk.App();
const vpcResource = new vpc_stack_1.VpcStack(app, 'VpcStack');
new rds_stack_1.RDSStack(app, 'ModelDbRDSStack', {
    vpc: vpcResource.vpc,
    username: 'postgres',
    databaseName: 'postgres',
    port: 5432,
});
// new ECSStack(app, 'ModelDbECSClusterStack', {
//     vpc: vpcResource.vpc,
//     dbUsername: 'postgres'
// });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSx1Q0FBcUM7QUFDckMsK0NBQXlDO0FBQ3pDLDRDQUE0QztBQUM1QywrQ0FBeUM7QUFDekMscUNBQXNDO0FBRXRDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLE1BQU0sV0FBVyxHQUFHLElBQUksb0JBQVEsQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFHLENBQUM7QUFDcEQsSUFBSSxvQkFBUSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRTtJQUNqQyxHQUFHLEVBQUUsV0FBVyxDQUFDLEdBQUc7SUFDcEIsUUFBUSxFQUFFLFVBQVU7SUFDcEIsWUFBWSxFQUFFLFVBQVU7SUFDeEIsSUFBSSxFQUFFLElBQUk7Q0FDYixDQUFDLENBQUM7QUFHSCxnREFBZ0Q7QUFDaEQsNEJBQTRCO0FBQzVCLDZCQUE2QjtBQUM3QixNQUFNIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0IHtWcGNTdGFja30gZnJvbSAnLi9saWIvdnBjLXN0YWNrJztcbi8vIGltcG9ydCB7RUNTU3RhY2t9IGZyb20gJy4vbGliL2Vjcy1zdGFjayc7XG5pbXBvcnQge1JEU1N0YWNrfSBmcm9tICcuL2xpYi9yZHMtc3RhY2snO1xuaW1wb3J0IGNkayA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2NvcmUnKTtcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuY29uc3QgdnBjUmVzb3VyY2UgPSBuZXcgVnBjU3RhY2soYXBwLCAnVnBjU3RhY2snLCApO1xubmV3IFJEU1N0YWNrKGFwcCwgJ01vZGVsRGJSRFNTdGFjaycsIHtcbiAgICB2cGM6IHZwY1Jlc291cmNlLnZwYyxcbiAgICB1c2VybmFtZTogJ3Bvc3RncmVzJyxcbiAgICBkYXRhYmFzZU5hbWU6ICdwb3N0Z3JlcycsXG4gICAgcG9ydDogNTQzMixcbn0pO1xuXG5cbi8vIG5ldyBFQ1NTdGFjayhhcHAsICdNb2RlbERiRUNTQ2x1c3RlclN0YWNrJywge1xuLy8gICAgIHZwYzogdnBjUmVzb3VyY2UudnBjLFxuLy8gICAgIGRiVXNlcm5hbWU6ICdwb3N0Z3Jlcydcbi8vIH0pOyJdfQ==