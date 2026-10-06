"""Throwaway spike S3. Run: uv run -q --with openpyxl python -I spikes/s3-admin-units/s3.py"""

import collections
import csv
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import openpyxl

DATA = Path(__file__).resolve().parent / "data"

KIND = {
    "Thành phố Trung ương": "city",
    "Tỉnh": "province",
    "Phường": "ward",
    "Xã": "commune",
    "Đặc khu": "special_zone",
}


@dataclass(frozen=True)
class AdminUnit:
    code: str
    name: str
    kind: str
    parent_code: str | None


@dataclass(frozen=True)
class LegacyLink:
    new_code: str
    old_province_code: str
    old_province_name: str
    old_district_code: str
    old_district_name: str
    old_commune_code: str | None
    old_commune_name: str | None
    merge: str


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = s.replace("’", "'")
    s = re.sub(r"[‐-―\-]", " ", s)
    s = re.sub(r"\btp\.?\s*", "thanh pho ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^(thanh pho|tinh|quan|huyen|thi xa|thi tran|phuong|xa|dac khu)\s+", "", s)
    return s


def clean(s: str) -> str:
    return " ".join(s.split())


def soap_rows(path: Path) -> list[dict[str, str]]:
    root = ET.parse(path).getroot()
    return [{c.tag: clean(c.text or "") for c in t} for t in root.iter("TABLE")]


def load_units() -> dict[str, AdminUnit]:
    units = {}
    for r in soap_rows(DATA / "nso_tinh.xml"):
        units[r["MaTinh"]] = AdminUnit(r["MaTinh"], r["TenTinh"], KIND[r["LoaiHinh"]], None)
    for r in soap_rows(DATA / "nso_phuong_xa.xml"):
        units[r["MaPhuongXa"]] = AdminUnit(r["MaPhuongXa"], r["TenPhuongXa"], KIND[r["LoaiHinh"]], r["MaTinh"])
    return units


def split_coded(s: str) -> tuple[str, str]:
    m = re.match(r"^(.*?)\s*\((\d+)\)\s*$", s.strip())
    assert m, f"unparsed coded name: {s!r}"
    return m.group(1), m.group(2)


def merge_kind(note: str | None) -> str:
    n = " ".join((note or "").lower().split())
    if "một phần" in n or "phần còn lại" in n or "một  phần" in n or "nhâp một phần" in n:
        return "partial"
    return "whole"


def load_links() -> list[LegacyLink]:
    ws = openpyxl.load_workbook(DATA / "nso_bang_chuyen_doi.xlsx", read_only=True).worksheets[1]
    raw = []
    for r in list(ws.iter_rows(values_only=True))[2:]:
        if r[2] is None:
            continue
        raw.append((r, split_coded(r[6]), split_coded(r[7])))
    votes = collections.defaultdict(collections.Counter)
    for _, (_, d), p in raw:
        votes[d][p] += 1
    district_province = {d: c.most_common(1)[0][0] for d, c in votes.items()}
    links, corrected = [], []
    for r, (district, district_code), row_province in raw:
        province, province_code = district_province[district_code]
        if row_province[1] != province_code:
            corrected.append((r[3], district, row_province, (province, province_code)))
        links.append(
            LegacyLink(
                new_code=f"{int(r[2]):05d}",
                old_province_code=province_code,
                old_province_name=clean(province),
                old_district_code=district_code,
                old_district_name=clean(district),
                old_commune_code=f"{int(r[4]):05d}" if r[4] is not None else None,
                old_commune_name=clean(r[3]) if r[3] else None,
                merge=merge_kind(r[5]),
            )
        )
    return links, corrected


def resolve(links, units, province, district=None, commune=None):
    hits = [
        l
        for l in links
        if norm(l.old_province_name) == norm(province)
        and (district is None or norm(l.old_district_name) == norm(district))
        and (commune is None or (l.old_commune_name and norm(l.old_commune_name) == norm(commune)))
    ]
    if not hits and commune is not None:
        print(f"  (no old commune {commune!r}; falling back to every current unit fed by old district {district!r})")
        return resolve(links, units, province, district)
    out = collections.OrderedDict()
    for l in hits:
        out.setdefault(l.new_code, l.merge)
    return [(units[c], m) for c, m in out.items()]


def show(label, results, units):
    if not results:
        print("  NO MATCH")
    for u, m in results:
        p = units[u.parent_code]
        print(f"  -> {u.name} ({u.code}, {u.kind}) | {p.name} ({p.code}) | from {m} old unit")


def main() -> int:
    units = load_units()
    links, corrected = load_links()
    provinces = [u for u in units.values() if u.parent_code is None]
    communes = [u for u in units.values() if u.parent_code is not None]

    print("province-level:", len(provinces), dict(collections.Counter(u.kind for u in provinces)))
    print("commune-level:", len(communes), dict(collections.Counter(u.kind for u in communes)))
    print("legacy links:", len(links), dict(collections.Counter(l.merge for l in links)))
    print("distinct old communes:", len({l.old_commune_code for l in links if l.old_commune_code}))
    print("district-only links (island districts):", sum(1 for l in links if l.old_commune_code is None))

    print("rows whose old-province column disagrees with their old district (corrected):", len(corrected))
    for c in corrected:
        print("  ", c)

    new_codes = {l.new_code for l in links}
    print("link targets missing from current list:", sorted(new_codes - {u.code for u in communes}))
    print("current units with no legacy link:", sorted({u.code for u in communes} - new_codes))

    by_old = collections.defaultdict(set)
    for l in links:
        if l.old_commune_code:
            by_old[l.old_commune_code].add(l.new_code)
    split = {k: v for k, v in by_old.items() if len(v) > 1}
    print("old communes split across >1 new unit:", len(split), "max fan-out:", max(map(len, split.values())))
    collide = collections.Counter(norm(u.name) + "|" + u.parent_code for u in communes)
    print("current name collisions within a province (accent-insensitive):", [k for k, v in collide.items() if v > 1])

    print("\nlegacy name ambiguity when only a district name is stripped of its prefix:")
    print("  di an:", sorted({f"{l.old_district_name}" for l in links if norm(l.old_district_name) == "di an"}))

    cases = [
        ("Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương", "Tỉnh Bình Dương", "Thành phố Dĩ An", "Phường Dĩ An"),
        ("Phường 1, Thành phố Vũng Tàu, Tỉnh Bà Rịa–Vũng Tàu", "Tỉnh Bà Rịa–Vũng Tàu", "Thành phố Vũng Tàu", "Phường 1"),
        ("Phường 2, Thành phố Tân An, Tỉnh Long An", "Tỉnh Long An", "Thành phố Tân An", "Phường 2"),
        ("Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai", "Tỉnh Đồng Nai", "Thành phố Biên Hòa", "Phường Tân Phong"),
        ("Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng", "Tỉnh Lâm Đồng", "Thành phố Bảo Lộc", "Phường 1"),
    ]
    def run(label, *args):
        print(f"\n{label}")
        show(label, resolve(links, units, *args), units)

    for label, p, d, c in cases:
        run(label, p, d, c)

    run("PRP-4 'Dĩ An, Bình Dương' as district", "Bình Dương", "Dĩ An")
    run("PRP-4 'Dĩ An, Bình Dương' as commune", "Bình Dương", None, "Dĩ An")
    run("'di an, binh duong' typed without accents", "binh duong", None, "di an")
    run("'Quận 7, TP. Hồ Chí Minh'", "TP. Hồ Chí Minh", "Quận 7")
    q7 = [l for l in links if norm(l.old_district_name) == "7" and norm(l.old_province_name) == "ho chi minh"]
    print("\nQuận 7 old wards -> new units:")
    for l in q7:
        print(f"  {l.old_commune_name} ({l.old_commune_code}) -> {units[l.new_code].name} ({l.new_code}) [{l.merge}]")
    print("\nsplit examples:")
    for old, news in list(split.items())[:3]:
        name = next(l.old_commune_name for l in links if l.old_commune_code == old)
        print(f"  {name} ({old}) -> " + ", ".join(f"{units[n].name} ({n})" for n in sorted(news)))

    print("\ncross-check vs vietnamadminunits (sapnhap.bando.com.vn derived), pairs old commune -> new commune:")
    nso_pairs = {(l.old_commune_code, l.new_code) for l in links if l.old_commune_code}
    with open(DATA / "vau_convert_legacy_2025_simple.csv", encoding="utf-8") as f:
        vau_pairs = {
            (f"{int(float(r['wardCode'])):05d}", r["newWardCode"].zfill(5))
            for r in csv.DictReader(f)
            if r["wardCode"] and r["newWardCode"]
        }
    print("  nso pairs:", len(nso_pairs), "vau pairs:", len(vau_pairs), "shared:", len(nso_pairs & vau_pairs))
    nso_old = {o for o, _ in nso_pairs}
    vau_old = {o for o, _ in vau_pairs}
    print("  old communes in both:", len(nso_old & vau_old), "only nso:", len(nso_old - vau_old), "only vau:", len(vau_old - nso_old))
    differ = sorted(o for o in nso_old & vau_old if {n for x, n in nso_pairs if x == o} != {n for x, n in vau_pairs if x == o})
    print("  old communes whose target set differs:", len(differ))
    for code in ("25942", "26506", "27694", "25996", "24823"):
        print(f"  {code}: nso={sorted(n for o, n in nso_pairs if o == code)} vau={sorted(n for o, n in vau_pairs if o == code)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
