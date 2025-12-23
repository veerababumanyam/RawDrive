from pydantic import BaseModel, ValidationError
from typing import Dict

class Model(BaseModel):
    d: Dict[str, int]

try:
    print("Testing {None: 1}...")
    m = Model(d={None: 1})
    print("Success:", m.d)
except ValidationError as e:
    print("Caught ValidationError:")
    print(e)
except Exception as e:
    print(f"Caught {type(e).__name__}: {e}")
