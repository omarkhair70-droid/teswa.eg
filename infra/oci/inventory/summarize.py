#!/usr/bin/env python3
import json, pathlib, re, sys

if len(sys.argv) != 2:
    raise SystemExit("usage: python3 infra/oci/inventory/summarize.py <inventory-output-dir>")

root = pathlib.Path(sys.argv[1]).resolve()
if not root.is_dir():
    raise SystemExit(f"not a directory: {root}")

def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

def rows(path):
    data = load(path).get("data", [])
    return data if isinstance(data, list) else []

def safe_num(v):
    return v if isinstance(v, (int, float)) else None

print("TESWA OCI SAFE SUMMARY")
print(f"inventory_dir={root.name}")

regions = rows(root / "regions.json")
home = [r.get("region-name") for r in regions if r.get("is-home-region")]
print("home_region=" + (home[0] if home else "unknown"))
print("subscribed_regions=" + ",".join(sorted(x.get("region-name","") for x in regions if x.get("region-name"))))

resource_dir = root / "resources"
files = list(resource_dir.glob("*.json"))

def all_rows(suffix):
    out=[]
    for p in files:
        if p.name.endswith(suffix):
            out.extend(rows(p))
    return out

instances = [x for x in all_rows("-compute.json") if x.get("lifecycle-state") not in {"TERMINATED","TERMINATING"}]
print(f"compute_instances={len(instances)}")
total_ocpu=0.0
total_mem=0.0
for x in instances:
    sc=x.get("shape-config") or {}
    o=safe_num(sc.get("ocpus"))
    m=safe_num(sc.get("memory-in-gbs"))
    if o is not None: total_ocpu += o
    if m is not None: total_mem += m
    print(f"instance shape={x.get('shape','unknown')} state={x.get('lifecycle-state','unknown')} ocpu={o if o is not None else 'unknown'} memory_gb={m if m is not None else 'unknown'}")
print(f"compute_total_ocpu={total_ocpu:g}")
print(f"compute_total_memory_gb={total_mem:g}")

boot = [x for x in all_rows("-boot-volumes.json") if x.get("lifecycle-state") not in {"TERMINATED","TERMINATING"}]
block = [x for x in all_rows("-block-volumes.json") if x.get("lifecycle-state") not in {"TERMINATED","TERMINATING"}]
boot_gb=sum((safe_num(x.get("size-in-gbs")) or 0) for x in boot)
block_gb=sum((safe_num(x.get("size-in-gbs")) or 0) for x in block)
print(f"boot_volumes={len(boot)} boot_volume_gb={boot_gb:g}")
print(f"block_volumes={len(block)} block_volume_gb={block_gb:g}")
print(f"volume_total_gb={boot_gb+block_gb:g}")

buckets = all_rows("-buckets.json")
print(f"object_storage_buckets={len(buckets)}")
approx = 0
has_approx = False
for b in buckets:
    for key in ("approximate-size","approximate-size-in-bytes"):
        v = safe_num(b.get(key))
        if v is not None:
            approx += v
            has_approx = True
            break
if has_approx:
    print(f"object_storage_approx_bytes={approx}")

lbs = [x for x in all_rows("-load-balancers.json") if x.get("lifecycle-state") not in {"DELETED","DELETING"}]
print(f"load_balancers={len(lbs)}")
print(f"vcns={len(all_rows('-vcns.json'))}")
print(f"subnets={len(all_rows('-subnets.json'))}")
print(f"nsgs={len(all_rows('-nsgs.json'))}")
print(f"vaults={len(all_rows('-vaults.json'))}")
print(f"alarms={len(all_rows('-alarms.json'))}")
print(f"notification_topics={len(all_rows('-notification-topics.json'))}")

print("\nRELEVANT LIMIT VALUES")
patterns = re.compile(r"(a1|ampere|arm|core|ocpu|memory|volume|object|bucket|load.?bal|secret|vault)", re.I)
for p in sorted((root/"limits").glob("*.json")):
    service = p.stem
    for r in rows(p):
        name = str(r.get("name",""))
        if not patterns.search(name) and not patterns.search(service):
            continue
        value = r.get("value")
        scope = r.get("scope-type") or r.get("scope_type") or ""
        ad = r.get("availability-domain") or r.get("availability_domain") or ""
        print(f"limit service={service} name={name} value={value} scope={scope} ad={ad}")

print("\nNo OCIDs, IP addresses, resource display names, or secret values are intentionally emitted.")
