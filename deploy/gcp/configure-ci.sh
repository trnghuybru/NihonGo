#!/usr/bin/env bash
# One-time setup: run as the project administrator after reviewing these grants.
set -Eeuo pipefail
project=true-shore-451709-f3
number=122275117568
service_account=nihongo-ci-tunnel@${project}.iam.gserviceaccount.com
gc=(gcloud --project="$project")
"${gc[@]}" services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
"${gc[@]}" iam service-accounts create nihongo-ci-tunnel --display-name='NihonGo GitHub CI IAP tunnel'
"${gc[@]}" iam workload-identity-pools create nihongo-github --location=global --display-name='NihonGo GitHub staging'
"${gc[@]}" iam workload-identity-pools providers create-oidc staging \
  --location=global --workload-identity-pool=nihongo-github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition="assertion.repository_id == '1398925426' && assertion.repository_owner_id == '118419973' && assertion.ref == 'refs/heads/staging' && assertion.event_name == 'push'"
"${gc[@]}" iam service-accounts add-iam-policy-binding "$service_account" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/nihongo-github/attribute.repository_id/1398925426"
"${gc[@]}" iam roles create nihongoCiVmLookup --title='NihonGo CI VM lookup' \
  --permissions=compute.instances.get,compute.instances.list --stage=GA
"${gc[@]}" projects add-iam-policy-binding "$project" \
  --member="serviceAccount:${service_account}" \
  --role="projects/${project}/roles/nihongoCiVmLookup" --condition=None
"${gc[@]}" projects add-iam-policy-binding "$project" \
  --member="serviceAccount:${service_account}" --role=roles/iap.tunnelResourceAccessor \
  --condition="expression=destination.ip == '10.42.0.2' && destination.port == 22,title=nihongo-sg-ssh-only"
