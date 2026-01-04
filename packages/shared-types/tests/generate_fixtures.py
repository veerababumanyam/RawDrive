import json
from pathlib import Path

from generated.python.types import InvitationStatus, GradientConfiguration, ColorStop

fixtures_dir = Path(__file__).parent / "fixtures"
fixtures_dir.mkdir(exist_ok=True)

# Generate InvitationStatus fixture
with open(fixtures_dir / "invitation_status.json", "w") as f:
    json.dump([e.value for e in InvitationStatus], f)

# Generate GradientConfiguration fixture
config = GradientConfiguration(
    type="linear",
    preset_id=None,
    direction=45,
    colors=[
        ColorStop(color="#FF5733", position=0),
        ColorStop(color="#33FF57", position=100),
    ],
)
with open(fixtures_dir / "gradient_config.json", "w") as f:
    f.write(config.model_dump_json())

print(f"Generated fixtures in {fixtures_dir}")
