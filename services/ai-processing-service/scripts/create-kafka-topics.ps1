# Create Kafka topics for AI Processing Service (PowerShell)
# Usage: pwsh scripts/create-kafka-topics.ps1 [kafka-bootstrap-server]

param(
    [string]$KafkaBootstrapServer = "localhost:9092"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating Kafka topics for AI Processing Service..." -ForegroundColor Cyan
Write-Host "Kafka Bootstrap Server: $KafkaBootstrapServer"
Write-Host ""

function Create-KafkaTopic {
    param(
        [string]$TopicName,
        [int]$Partitions,
        [int]$ReplicationFactor,
        [long]$RetentionMs,
        [long]$MaxMessageBytes,
        [int]$MinInSyncReplicas
    )

    $RetentionDays = [math]::Floor($RetentionMs / 86400000)
    $MaxMessageMB = [math]::Floor($MaxMessageBytes / 1048576)

    Write-Host "Creating topic: $TopicName" -ForegroundColor Yellow
    Write-Host "  Partitions: $Partitions"
    Write-Host "  Replication Factor: $ReplicationFactor"
    Write-Host "  Retention: $RetentionMs ms ($RetentionDays days)"
    Write-Host "  Max Message Size: $MaxMessageBytes bytes ($MaxMessageMB MB)"
    Write-Host ""

    try {
        kafka-topics.bat --bootstrap-server $KafkaBootstrapServer `
            --create `
            --if-not-exists `
            --topic $TopicName `
            --partitions $Partitions `
            --replication-factor $ReplicationFactor `
            --config retention.ms=$RetentionMs `
            --config cleanup.policy=delete `
            --config compression.type=lz4 `
            --config max.message.bytes=$MaxMessageBytes `
            --config min.insync.replicas=$MinInSyncReplicas
    } catch {
        Write-Warning "Failed to create topic $TopicName (may already exist)"
    }
}

# =============================================================================
# Create Topics
# =============================================================================

# Asset AI Processing (from upload-service)
Create-KafkaTopic -TopicName "asset-ai-processing" -Partitions 12 -ReplicationFactor 3 `
    -RetentionMs 259200000 -MaxMessageBytes 10485760 -MinInSyncReplicas 2

# AI Results (to gallery-service and other consumers)
Create-KafkaTopic -TopicName "asset-ai-results" -Partitions 12 -ReplicationFactor 3 `
    -RetentionMs 604800000 -MaxMessageBytes 20971520 -MinInSyncReplicas 2

# Content Moderation (compliance retention)
Create-KafkaTopic -TopicName "asset-moderation" -Partitions 6 -ReplicationFactor 3 `
    -RetentionMs 2592000000 -MaxMessageBytes 5242880 -MinInSyncReplicas 2

# Duplicate Detection
Create-KafkaTopic -TopicName "asset-duplicates" -Partitions 6 -ReplicationFactor 3 `
    -RetentionMs 604800000 -MaxMessageBytes 15728640 -MinInSyncReplicas 2

# Image Upscaling
Create-KafkaTopic -TopicName "asset-upscaling" -Partitions 3 -ReplicationFactor 3 `
    -RetentionMs 259200000 -MaxMessageBytes 5242880 -MinInSyncReplicas 2

Write-Host ""
Write-Host "✅ Kafka topics created successfully!" -ForegroundColor Green
Write-Host ""

# List created topics
Write-Host "Verifying topics:" -ForegroundColor Cyan
kafka-topics.bat --bootstrap-server $KafkaBootstrapServer --list | Select-String "asset-ai|asset-moderation|asset-duplicates|asset-upscaling"

Write-Host ""
Write-Host "Topic details:" -ForegroundColor Cyan
$topics = @("asset-ai-processing", "asset-ai-results", "asset-moderation", "asset-duplicates", "asset-upscaling")
foreach ($topic in $topics) {
    Write-Host ""
    Write-Host "Topic: $topic" -ForegroundColor Yellow
    kafka-topics.bat --bootstrap-server $KafkaBootstrapServer --describe --topic $topic
}
