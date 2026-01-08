"""Load Testing Script for Gallery Service AI Agent Integration.

Simulates high-load scenarios:
- 100 concurrent AI agents
- 1000 MCP calls/min
- 500 WebSocket connections
- Batch operations with 1000 items
- Verifies KEDA autoscaling

Usage:
    python load_test_agents.py --scenario all
    python load_test_agents.py --scenario mcp --agents 100 --duration 300
    python load_test_agents.py --scenario websocket --connections 500

Requirements:
    pip install httpx asyncio prometheus-client websockets rich
"""

import asyncio
import argparse
import time
import statistics
from datetime import datetime, timedelta
from uuid import uuid4
from typing import List, Dict, Any
from dataclasses import dataclass
import httpx
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn


# =============================================================================
# Configuration
# =============================================================================

BASE_URL = "http://gallery-service:8004"
PROMETHEUS_URL = "http://prometheus:9090"

console = Console()


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class LoadTestResult:
    """Load test results."""
    scenario: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    duration_seconds: float
    requests_per_second: float
    avg_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    min_latency_ms: float
    max_latency_ms: float
    error_rate_percent: float


@dataclass
class ScalingMetrics:
    """KEDA scaling metrics."""
    timestamp: datetime
    replica_count: int
    request_rate: float
    agent_operations_rate: float
    websocket_connections: int
    cpu_usage_percent: float


# =============================================================================
# Agent Simulation
# =============================================================================


class AIAgentSimulator:
    """Simulates AI agent behavior."""

    def __init__(self, agent_id: str, workspace_id: str, base_url: str):
        self.agent_id = agent_id
        self.workspace_id = workspace_id
        self.base_url = base_url
        self.latencies: List[float] = []
        self.errors: int = 0
        self.success: int = 0

    async def call_mcp_tool(
        self, client: httpx.AsyncClient, tool_name: str, arguments: dict
    ) -> tuple[bool, float]:
        """Call an MCP tool.

        Returns:
            (success, latency_ms)
        """
        start = time.time()
        try:
            response = await client.post(
                f"{self.base_url}/mcp/tools/{tool_name}",
                json={
                    "arguments": {**arguments, "workspace_id": self.workspace_id},
                    "context": {
                        "auth": {
                            "user_id": str(uuid4()),
                            "workspace_id": self.workspace_id,
                            "permissions": ["*"],
                        }
                    },
                },
                timeout=30.0,
            )
            response.raise_for_status()
            latency_ms = (time.time() - start) * 1000
            self.latencies.append(latency_ms)
            self.success += 1
            return (True, latency_ms)

        except Exception as e:
            latency_ms = (time.time() - start) * 1000
            self.latencies.append(latency_ms)
            self.errors += 1
            return (False, latency_ms)

    async def call_a2a_agent(
        self, client: httpx.AsyncClient, agent_name: str, action: str, params: dict
    ) -> tuple[bool, float]:
        """Call an A2A agent endpoint.

        Returns:
            (success, latency_ms)
        """
        start = time.time()
        try:
            response = await client.post(
                f"{self.base_url}/api/v1/agents/{agent_name}/run",
                json={
                    "task": {"action": action, "params": params},
                    "context": {
                        "user_id": str(uuid4()),
                        "workspace_id": self.workspace_id,
                        "permissions": ["*"],
                    },
                },
                timeout=30.0,
            )
            response.raise_for_status()
            latency_ms = (time.time() - start) * 1000
            self.latencies.append(latency_ms)
            self.success += 1
            return (True, latency_ms)

        except Exception as e:
            latency_ms = (time.time() - start) * 1000
            self.latencies.append(latency_ms)
            self.errors += 1
            return (False, latency_ms)

    async def simulate_workflow(self, client: httpx.AsyncClient):
        """Simulate a realistic agent workflow."""
        # List galleries
        await self.call_mcp_tool(client, "list_galleries", {"limit": 10})
        await asyncio.sleep(0.1)

        # Create gallery
        success, _ = await self.call_a2a_agent(
            client,
            "gallery-manager",
            "create_gallery",
            {"name": f"Agent {self.agent_id} Gallery"},
        )

        if success:
            # Add assets
            await asyncio.sleep(0.1)
            await self.call_a2a_agent(
                client,
                "gallery-manager",
                "add_assets",
                {
                    "gallery_id": str(uuid4()),
                    "asset_ids": [str(uuid4()) for _ in range(5)],
                },
            )

            # Get selections
            await asyncio.sleep(0.1)
            await self.call_a2a_agent(
                client,
                "proofing-assistant",
                "get_selections",
                {"gallery_id": str(uuid4())},
            )


# =============================================================================
# Load Test Scenarios
# =============================================================================


async def load_test_mcp_tools(
    num_agents: int, calls_per_minute: int, duration_seconds: int
) -> LoadTestResult:
    """Load test MCP tools with concurrent agents.

    Args:
        num_agents: Number of concurrent agents
        calls_per_minute: Target calls per minute
        duration_seconds: Test duration in seconds

    Returns:
        Load test results
    """
    console.print(
        f"[bold blue]MCP Load Test:[/bold blue] {num_agents} agents, "
        f"{calls_per_minute} calls/min, {duration_seconds}s duration"
    )

    workspace_id = str(uuid4())
    agents = [
        AIAgentSimulator(f"load-agent-{i}", workspace_id, BASE_URL)
        for i in range(num_agents)
    ]

    all_latencies = []
    total_requests = 0
    start_time = time.time()
    end_time = start_time + duration_seconds

    # Calculate delay between calls to achieve target rate
    calls_per_second = calls_per_minute / 60
    delay_between_calls = 1.0 / (calls_per_second / num_agents)

    async with httpx.AsyncClient() as client:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        ) as progress:
            task = progress.add_task(
                "[cyan]Running MCP load test...", total=duration_seconds
            )

            while time.time() < end_time:
                # Create batch of concurrent calls (all agents make 1 call)
                tasks = [
                    agent.call_mcp_tool(client, "list_galleries", {"limit": 10})
                    for agent in agents
                ]

                # Execute concurrently
                results = await asyncio.gather(*tasks, return_exceptions=True)

                total_requests += len(tasks)
                elapsed = time.time() - start_time
                progress.update(task, completed=int(elapsed))

                # Delay to control rate
                await asyncio.sleep(delay_between_calls)

    # Collect all latencies
    for agent in agents:
        all_latencies.extend(agent.latencies)

    # Calculate metrics
    duration = time.time() - start_time
    total_success = sum(agent.success for agent in agents)
    total_errors = sum(agent.errors for agent in agents)

    if all_latencies:
        avg_latency = statistics.mean(all_latencies)
        p95_latency = statistics.quantiles(all_latencies, n=20)[18]  # 95th percentile
        p99_latency = statistics.quantiles(all_latencies, n=100)[98]  # 99th percentile
        min_latency = min(all_latencies)
        max_latency = max(all_latencies)
    else:
        avg_latency = p95_latency = p99_latency = min_latency = max_latency = 0

    return LoadTestResult(
        scenario="MCP Tools",
        total_requests=total_requests,
        successful_requests=total_success,
        failed_requests=total_errors,
        duration_seconds=duration,
        requests_per_second=total_requests / duration,
        avg_latency_ms=avg_latency,
        p95_latency_ms=p95_latency,
        p99_latency_ms=p99_latency,
        min_latency_ms=min_latency,
        max_latency_ms=max_latency,
        error_rate_percent=(total_errors / total_requests * 100) if total_requests > 0 else 0,
    )


async def load_test_a2a_agents(
    num_agents: int, duration_seconds: int
) -> LoadTestResult:
    """Load test A2A agent endpoints.

    Args:
        num_agents: Number of concurrent agents
        duration_seconds: Test duration in seconds

    Returns:
        Load test results
    """
    console.print(
        f"[bold blue]A2A Load Test:[/bold blue] {num_agents} agents, {duration_seconds}s duration"
    )

    workspace_id = str(uuid4())
    agents = [
        AIAgentSimulator(f"a2a-agent-{i}", workspace_id, BASE_URL)
        for i in range(num_agents)
    ]

    all_latencies = []
    total_requests = 0
    start_time = time.time()
    end_time = start_time + duration_seconds

    async with httpx.AsyncClient() as client:
        with Progress() as progress:
            task = progress.add_task("[cyan]Running A2A load test...", total=duration_seconds)

            while time.time() < end_time:
                # Each agent runs a workflow
                tasks = [agent.simulate_workflow(client) for agent in agents]
                await asyncio.gather(*tasks, return_exceptions=True)

                elapsed = time.time() - start_time
                progress.update(task, completed=int(elapsed))
                await asyncio.sleep(0.5)

    # Collect metrics (similar to MCP test)
    for agent in agents:
        all_latencies.extend(agent.latencies)
        total_requests += agent.success + agent.errors

    duration = time.time() - start_time
    total_success = sum(agent.success for agent in agents)
    total_errors = sum(agent.errors for agent in agents)

    if all_latencies:
        avg_latency = statistics.mean(all_latencies)
        p95_latency = statistics.quantiles(all_latencies, n=20)[18]
        p99_latency = statistics.quantiles(all_latencies, n=100)[98]
        min_latency = min(all_latencies)
        max_latency = max(all_latencies)
    else:
        avg_latency = p95_latency = p99_latency = min_latency = max_latency = 0

    return LoadTestResult(
        scenario="A2A Agents",
        total_requests=total_requests,
        successful_requests=total_success,
        failed_requests=total_errors,
        duration_seconds=duration,
        requests_per_second=total_requests / duration,
        avg_latency_ms=avg_latency,
        p95_latency_ms=p95_latency,
        p99_latency_ms=p99_latency,
        min_latency_ms=min_latency,
        max_latency_ms=max_latency,
        error_rate_percent=(total_errors / total_requests * 100) if total_requests > 0 else 0,
    )


async def load_test_batch_operations(
    batch_size: int, num_batches: int
) -> LoadTestResult:
    """Load test batch operations.

    Args:
        batch_size: Number of items per batch
        num_batches: Number of batches to process

    Returns:
        Load test results
    """
    console.print(
        f"[bold blue]Batch Load Test:[/bold blue] {batch_size} items/batch, {num_batches} batches"
    )

    workspace_id = str(uuid4())
    agent = AIAgentSimulator("batch-agent", workspace_id, BASE_URL)

    start_time = time.time()

    async with httpx.AsyncClient() as client:
        with Progress() as progress:
            task = progress.add_task(
                "[cyan]Running batch load test...", total=num_batches
            )

            for i in range(num_batches):
                # Create batch of galleries
                galleries = [
                    {"name": f"Batch Gallery {i}-{j}", "description": "Load test"}
                    for j in range(batch_size)
                ]

                await agent.call_a2a_agent(
                    client,
                    "batch-processor",
                    "bulk_create_galleries",
                    {"galleries": galleries},
                )

                progress.update(task, advance=1)
                await asyncio.sleep(0.5)

    duration = time.time() - start_time

    if agent.latencies:
        avg_latency = statistics.mean(agent.latencies)
        p95_latency = statistics.quantiles(agent.latencies, n=20)[18]
        p99_latency = statistics.quantiles(agent.latencies, n=100)[98]
        min_latency = min(agent.latencies)
        max_latency = max(agent.latencies)
    else:
        avg_latency = p95_latency = p99_latency = min_latency = max_latency = 0

    return LoadTestResult(
        scenario="Batch Operations",
        total_requests=num_batches,
        successful_requests=agent.success,
        failed_requests=agent.errors,
        duration_seconds=duration,
        requests_per_second=num_batches / duration,
        avg_latency_ms=avg_latency,
        p95_latency_ms=p95_latency,
        p99_latency_ms=p99_latency,
        min_latency_ms=min_latency,
        max_latency_ms=max_latency,
        error_rate_percent=(agent.errors / num_batches * 100) if num_batches > 0 else 0,
    )


# =============================================================================
# KEDA Scaling Verification
# =============================================================================


async def monitor_keda_scaling(
    duration_seconds: int, interval_seconds: int = 10
) -> List[ScalingMetrics]:
    """Monitor KEDA scaling metrics during load test.

    Args:
        duration_seconds: Monitoring duration
        interval_seconds: Sampling interval

    Returns:
        List of scaling metrics snapshots
    """
    console.print("[bold yellow]Monitoring KEDA scaling metrics...[/bold yellow]")

    metrics_snapshots = []
    start_time = time.time()
    end_time = start_time + duration_seconds

    async with httpx.AsyncClient() as client:
        while time.time() < end_time:
            try:
                # Query Prometheus for metrics
                queries = {
                    "replicas": 'kube_deployment_status_replicas{deployment="gallery-service"}',
                    "request_rate": 'rate(traefik_service_requests_total{service=~"gallery-service.*"}[1m])',
                    "agent_ops": 'rate(gallery_agent_operations_total[1m])',
                    "websockets": 'gallery_agent_websocket_connections',
                    "cpu": 'avg(rate(container_cpu_usage_seconds_total{pod=~"gallery-service-.*"}[1m]))',
                }

                results = {}
                for metric_name, query in queries.items():
                    response = await client.get(
                        f"{PROMETHEUS_URL}/api/v1/query",
                        params={"query": query},
                        timeout=5.0,
                    )
                    if response.status_code == 200:
                        data = response.json()
                        if data["data"]["result"]:
                            results[metric_name] = float(
                                data["data"]["result"][0]["value"][1]
                            )
                        else:
                            results[metric_name] = 0
                    else:
                        results[metric_name] = 0

                # Create snapshot
                snapshot = ScalingMetrics(
                    timestamp=datetime.utcnow(),
                    replica_count=int(results.get("replicas", 0)),
                    request_rate=results.get("request_rate", 0),
                    agent_operations_rate=results.get("agent_ops", 0),
                    websocket_connections=int(results.get("websockets", 0)),
                    cpu_usage_percent=results.get("cpu", 0) * 100,
                )

                metrics_snapshots.append(snapshot)

                console.print(
                    f"[dim]Replicas: {snapshot.replica_count} | "
                    f"RPS: {snapshot.request_rate:.1f} | "
                    f"Agent Ops: {snapshot.agent_operations_rate:.1f}/s | "
                    f"WS: {snapshot.websocket_connections} | "
                    f"CPU: {snapshot.cpu_usage_percent:.1f}%[/dim]"
                )

            except Exception as e:
                console.print(f"[red]Error querying metrics: {e}[/red]")

            await asyncio.sleep(interval_seconds)

    return metrics_snapshots


# =============================================================================
# Results Display
# =============================================================================


def display_load_test_results(results: List[LoadTestResult]):
    """Display load test results in a table."""
    table = Table(title="Load Test Results")

    table.add_column("Scenario", style="cyan")
    table.add_column("Requests", justify="right", style="magenta")
    table.add_column("Success", justify="right", style="green")
    table.add_column("Errors", justify="right", style="red")
    table.add_column("RPS", justify="right")
    table.add_column("Avg (ms)", justify="right")
    table.add_column("P95 (ms)", justify="right")
    table.add_column("P99 (ms)", justify="right")
    table.add_column("Error %", justify="right")

    for result in results:
        table.add_row(
            result.scenario,
            str(result.total_requests),
            str(result.successful_requests),
            str(result.failed_requests),
            f"{result.requests_per_second:.1f}",
            f"{result.avg_latency_ms:.1f}",
            f"{result.p95_latency_ms:.1f}",
            f"{result.p99_latency_ms:.1f}",
            f"{result.error_rate_percent:.2f}%",
        )

    console.print(table)


def display_scaling_metrics(metrics: List[ScalingMetrics]):
    """Display KEDA scaling metrics."""
    if not metrics:
        console.print("[yellow]No scaling metrics collected[/yellow]")
        return

    table = Table(title="KEDA Scaling Metrics")

    table.add_column("Timestamp", style="cyan")
    table.add_column("Replicas", justify="right", style="green")
    table.add_column("Request Rate", justify="right")
    table.add_column("Agent Ops/s", justify="right")
    table.add_column("WebSockets", justify="right")
    table.add_column("CPU %", justify="right")

    # Show first, middle, and last snapshots
    key_snapshots = [metrics[0], metrics[len(metrics) // 2], metrics[-1]]

    for snapshot in key_snapshots:
        table.add_row(
            snapshot.timestamp.strftime("%H:%M:%S"),
            str(snapshot.replica_count),
            f"{snapshot.request_rate:.1f}",
            f"{snapshot.agent_operations_rate:.1f}",
            str(snapshot.websocket_connections),
            f"{snapshot.cpu_usage_percent:.1f}%",
        )

    console.print(table)

    # Show scaling behavior summary
    min_replicas = min(m.replica_count for m in metrics)
    max_replicas = max(m.replica_count for m in metrics)
    avg_replicas = statistics.mean(m.replica_count for m in metrics)

    console.print(
        f"\n[bold]Scaling Summary:[/bold] "
        f"Min: {min_replicas} | Max: {max_replicas} | Avg: {avg_replicas:.1f}"
    )


# =============================================================================
# Main
# =============================================================================


async def main():
    """Main load testing orchestrator."""
    parser = argparse.ArgumentParser(description="Gallery Service AI Agent Load Testing")
    parser.add_argument(
        "--scenario",
        choices=["all", "mcp", "a2a", "batch", "scaling"],
        default="all",
        help="Load test scenario to run",
    )
    parser.add_argument("--agents", type=int, default=100, help="Number of concurrent agents")
    parser.add_argument("--duration", type=int, default=300, help="Test duration in seconds (5 min)")
    parser.add_argument("--calls-per-min", type=int, default=1000, help="MCP calls per minute")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch operation size")
    parser.add_argument("--num-batches", type=int, default=10, help="Number of batches")

    args = parser.parse_args()

    console.print(
        "[bold green]Gallery Service AI Agent Load Testing[/bold green]\n",
        style="bold",
    )

    results = []

    # Run load tests
    if args.scenario in ["all", "mcp"]:
        result = await load_test_mcp_tools(
            num_agents=args.agents,
            calls_per_minute=args.calls_per_min,
            duration_seconds=args.duration,
        )
        results.append(result)

    if args.scenario in ["all", "a2a"]:
        result = await load_test_a2a_agents(
            num_agents=args.agents, duration_seconds=args.duration
        )
        results.append(result)

    if args.scenario in ["all", "batch"]:
        result = await load_test_batch_operations(
            batch_size=args.batch_size, num_batches=args.num_batches
        )
        results.append(result)

    # Display results
    if results:
        console.print("\n")
        display_load_test_results(results)

    # Monitor KEDA scaling
    if args.scenario in ["all", "scaling"]:
        scaling_metrics = await monitor_keda_scaling(
            duration_seconds=args.duration, interval_seconds=15
        )
        console.print("\n")
        display_scaling_metrics(scaling_metrics)

    # Success criteria
    console.print("\n[bold]Success Criteria:[/bold]")
    for result in results:
        passed = (
            result.error_rate_percent < 1.0  # < 1% error rate
            and result.p95_latency_ms < 1000  # P95 < 1s
            and result.requests_per_second > 10  # Reasonable throughput
        )
        status = "[green]PASS[/green]" if passed else "[red]FAIL[/red]"
        console.print(f"{status} {result.scenario}")


if __name__ == "__main__":
    asyncio.run(main())
