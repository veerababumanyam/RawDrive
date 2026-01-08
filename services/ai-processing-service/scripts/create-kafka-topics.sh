#!/bin/bash
# Create Kafka topics for AI Processing Service
# Usage: bash scripts/create-kafka-topics.sh [kafka-bootstrap-server]

set -e

KAFKA_BOOTSTRAP_SERVER="${1:-localhost:9092}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KAFKA_DIR="$SCRIPT_DIR/../infrastructure/kafka"

echo "Creating Kafka topics for AI Processing Service..."
echo "Kafka Bootstrap Server: $KAFKA_BOOTSTRAP_SERVER"
echo ""

# Function to create topic
create_topic() {
    local topic_name=$1
    local partitions=$2
    local replication_factor=$3
    local retention_ms=$4
    local max_message_bytes=$5
    local min_insync_replicas=$6

    echo "Creating topic: $topic_name"
    echo "  Partitions: $partitions"
    echo "  Replication Factor: $replication_factor"
    echo "  Retention: $retention_ms ms ($(($retention_ms / 86400000)) days)"
    echo "  Max Message Size: $max_message_bytes bytes ($(($max_message_bytes / 1048576)) MB)"
    echo ""

    kafka-topics.sh --bootstrap-server "$KAFKA_BOOTSTRAP_SERVER" \
        --create \
        --if-not-exists \
        --topic "$topic_name" \
        --partitions "$partitions" \
        --replication-factor "$replication_factor" \
        --config retention.ms="$retention_ms" \
        --config cleanup.policy=delete \
        --config compression.type=lz4 \
        --config max.message.bytes="$max_message_bytes" \
        --config min.insync.replicas="$min_insync_replicas" || {
        echo "Warning: Failed to create topic $topic_name (may already exist)"
    }
}

# =============================================================================
# Create Topics
# =============================================================================

# Asset AI Processing (from upload-service)
create_topic "asset-ai-processing" 12 3 259200000 10485760 2

# AI Results (to gallery-service and other consumers)
create_topic "asset-ai-results" 12 3 604800000 20971520 2

# Content Moderation (compliance retention)
create_topic "asset-moderation" 6 3 2592000000 5242880 2

# Duplicate Detection
create_topic "asset-duplicates" 6 3 604800000 15728640 2

# Image Upscaling
create_topic "asset-upscaling" 3 3 259200000 5242880 2

echo ""
echo "✅ Kafka topics created successfully!"
echo ""

# List created topics
echo "Verifying topics:"
kafka-topics.sh --bootstrap-server "$KAFKA_BOOTSTRAP_SERVER" --list | grep -E "asset-ai|asset-moderation|asset-duplicates|asset-upscaling" || true

echo ""
echo "Topic details:"
for topic in asset-ai-processing asset-ai-results asset-moderation asset-duplicates asset-upscaling; do
    echo ""
    echo "Topic: $topic"
    kafka-topics.sh --bootstrap-server "$KAFKA_BOOTSTRAP_SERVER" --describe --topic "$topic" || true
done
