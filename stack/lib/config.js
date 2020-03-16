"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ConfigOptions {
    constructor() {
        this.vertaAIImages = {
            ModelDBBackEnd: 'vertaaiofficial/modeldb-backend:latest',
            ModelDBFrontend: 'vertaaiofficial/modeldb-frontend:latest',
            ModelDBProxy: 'vertaaiofficial/modeldb-proxy:latest'
        };
        this.userData = `
#!/bin/bash
mkdir -p /ecs/backend/config/
cat << EOF > /ecs/backend/config/config.yaml 
#This config is used by docker compose.
#ModelDB Properties
grpcServer:
    port: 8085

springServer:
    port: 8086
    shutdownTimeout: 30 #time in second

artifactStoreConfig:
    artifactStoreType: NFS #S3, GCP, NFS
    NFS:
    nfsUrlProtocol: http
    nfsRootPath: /artifact-store/
    artifactEndpoint:
        getArtifact: "api/v1/artifact/getArtifact"
        storeArtifact: "api/v1/artifact/storeArtifact"

# Database settings (type mongodb, couchbasedb, relational etc..)
database:
    DBType: relational
    timeout: 4
    liquibaseLockThreshold: 60 #time in second
    RdbConfiguration:
    RdbDatabaseName: postgres
    RdbDriver: "org.postgresql.Driver"
    RdbDialect: "org.hibernate.dialect.PostgreSQLDialect"
    RdbUrl: "#{modelDBRDSInstanceUrl}"
    RdbUsername: "#{myProdRDSUsername}"
    RdbPassword: "#{myProdRDSPassword}"

# Test Database settings (type mongodb, couchbasedb etc..)
test:
    test-database:
    DBType: relational
    timeout: 4
    liquibaseLockThreshold: 60 #time in second
    RdbConfiguration:
        RdbDatabaseName: postgres
        RdbDriver: "org.postgresql.Driver"
        RdbDialect: "org.hibernate.dialect.PostgreSQLDialect"
        RdbUrl: "jdbc:postgresql://modeldb-postgres:5432"
        RdbUsername: postgres
        RdbPassword: root

#ArtifactStore Properties
artifactStore_grpcServer:
    host: modeldb-backend
    port: 8086

telemetry:
    opt_in: true
    frequency: 1 #frequency to share data in hours, default 1
    consumer: https://app.verta.ai/api/v1/uac-proxy/telemetry/collectTelemetry
EOF     
`;
    }
}
exports.ConfigOptions = ConfigOptions;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBYSxhQUFhO0lBQTFCO1FBQ0ksa0JBQWEsR0FBRztZQUNaLGNBQWMsRUFBRSx3Q0FBd0M7WUFDeEQsZUFBZSxFQUFFLHlDQUF5QztZQUMxRCxZQUFZLEVBQUUsc0NBQXNDO1NBQ3ZELENBQUE7UUFDRCxhQUFRLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBMkRkLENBQUE7SUFDRCxDQUFDO0NBQUE7QUFsRUQsc0NBa0VDIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNsYXNzIENvbmZpZ09wdGlvbnMge1xuICAgIHZlcnRhQUlJbWFnZXMgPSB7XG4gICAgICAgIE1vZGVsREJCYWNrRW5kOiAndmVydGFhaW9mZmljaWFsL21vZGVsZGItYmFja2VuZDpsYXRlc3QnLFxuICAgICAgICBNb2RlbERCRnJvbnRlbmQ6ICd2ZXJ0YWFpb2ZmaWNpYWwvbW9kZWxkYi1mcm9udGVuZDpsYXRlc3QnLFxuICAgICAgICBNb2RlbERCUHJveHk6ICd2ZXJ0YWFpb2ZmaWNpYWwvbW9kZWxkYi1wcm94eTpsYXRlc3QnXG4gICAgfVxuICAgIHVzZXJEYXRhID0gYFxuIyEvYmluL2Jhc2hcbm1rZGlyIC1wIC9lY3MvYmFja2VuZC9jb25maWcvXG5jYXQgPDwgRU9GID4gL2Vjcy9iYWNrZW5kL2NvbmZpZy9jb25maWcueWFtbCBcbiNUaGlzIGNvbmZpZyBpcyB1c2VkIGJ5IGRvY2tlciBjb21wb3NlLlxuI01vZGVsREIgUHJvcGVydGllc1xuZ3JwY1NlcnZlcjpcbiAgICBwb3J0OiA4MDg1XG5cbnNwcmluZ1NlcnZlcjpcbiAgICBwb3J0OiA4MDg2XG4gICAgc2h1dGRvd25UaW1lb3V0OiAzMCAjdGltZSBpbiBzZWNvbmRcblxuYXJ0aWZhY3RTdG9yZUNvbmZpZzpcbiAgICBhcnRpZmFjdFN0b3JlVHlwZTogTkZTICNTMywgR0NQLCBORlNcbiAgICBORlM6XG4gICAgbmZzVXJsUHJvdG9jb2w6IGh0dHBcbiAgICBuZnNSb290UGF0aDogL2FydGlmYWN0LXN0b3JlL1xuICAgIGFydGlmYWN0RW5kcG9pbnQ6XG4gICAgICAgIGdldEFydGlmYWN0OiBcImFwaS92MS9hcnRpZmFjdC9nZXRBcnRpZmFjdFwiXG4gICAgICAgIHN0b3JlQXJ0aWZhY3Q6IFwiYXBpL3YxL2FydGlmYWN0L3N0b3JlQXJ0aWZhY3RcIlxuXG4jIERhdGFiYXNlIHNldHRpbmdzICh0eXBlIG1vbmdvZGIsIGNvdWNoYmFzZWRiLCByZWxhdGlvbmFsIGV0Yy4uKVxuZGF0YWJhc2U6XG4gICAgREJUeXBlOiByZWxhdGlvbmFsXG4gICAgdGltZW91dDogNFxuICAgIGxpcXVpYmFzZUxvY2tUaHJlc2hvbGQ6IDYwICN0aW1lIGluIHNlY29uZFxuICAgIFJkYkNvbmZpZ3VyYXRpb246XG4gICAgUmRiRGF0YWJhc2VOYW1lOiBwb3N0Z3Jlc1xuICAgIFJkYkRyaXZlcjogXCJvcmcucG9zdGdyZXNxbC5Ecml2ZXJcIlxuICAgIFJkYkRpYWxlY3Q6IFwib3JnLmhpYmVybmF0ZS5kaWFsZWN0LlBvc3RncmVTUUxEaWFsZWN0XCJcbiAgICBSZGJVcmw6IFwiI3ttb2RlbERCUkRTSW5zdGFuY2VVcmx9XCJcbiAgICBSZGJVc2VybmFtZTogXCIje215UHJvZFJEU1VzZXJuYW1lfVwiXG4gICAgUmRiUGFzc3dvcmQ6IFwiI3tteVByb2RSRFNQYXNzd29yZH1cIlxuXG4jIFRlc3QgRGF0YWJhc2Ugc2V0dGluZ3MgKHR5cGUgbW9uZ29kYiwgY291Y2hiYXNlZGIgZXRjLi4pXG50ZXN0OlxuICAgIHRlc3QtZGF0YWJhc2U6XG4gICAgREJUeXBlOiByZWxhdGlvbmFsXG4gICAgdGltZW91dDogNFxuICAgIGxpcXVpYmFzZUxvY2tUaHJlc2hvbGQ6IDYwICN0aW1lIGluIHNlY29uZFxuICAgIFJkYkNvbmZpZ3VyYXRpb246XG4gICAgICAgIFJkYkRhdGFiYXNlTmFtZTogcG9zdGdyZXNcbiAgICAgICAgUmRiRHJpdmVyOiBcIm9yZy5wb3N0Z3Jlc3FsLkRyaXZlclwiXG4gICAgICAgIFJkYkRpYWxlY3Q6IFwib3JnLmhpYmVybmF0ZS5kaWFsZWN0LlBvc3RncmVTUUxEaWFsZWN0XCJcbiAgICAgICAgUmRiVXJsOiBcImpkYmM6cG9zdGdyZXNxbDovL21vZGVsZGItcG9zdGdyZXM6NTQzMlwiXG4gICAgICAgIFJkYlVzZXJuYW1lOiBwb3N0Z3Jlc1xuICAgICAgICBSZGJQYXNzd29yZDogcm9vdFxuXG4jQXJ0aWZhY3RTdG9yZSBQcm9wZXJ0aWVzXG5hcnRpZmFjdFN0b3JlX2dycGNTZXJ2ZXI6XG4gICAgaG9zdDogbW9kZWxkYi1iYWNrZW5kXG4gICAgcG9ydDogODA4NlxuXG50ZWxlbWV0cnk6XG4gICAgb3B0X2luOiB0cnVlXG4gICAgZnJlcXVlbmN5OiAxICNmcmVxdWVuY3kgdG8gc2hhcmUgZGF0YSBpbiBob3VycywgZGVmYXVsdCAxXG4gICAgY29uc3VtZXI6IGh0dHBzOi8vYXBwLnZlcnRhLmFpL2FwaS92MS91YWMtcHJveHkvdGVsZW1ldHJ5L2NvbGxlY3RUZWxlbWV0cnlcbkVPRiAgICAgXG5gXG59Il19