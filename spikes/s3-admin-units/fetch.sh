#!/usr/bin/env bash
# Downloads the official NSO admin unit data into data/ and verifies it against SHA256SUMS.
# DEN_NGAY pins the NSO catalog date (dd/MM/yyyy). Pass --update to rewrite SHA256SUMS after a deliberate refresh.
set -euo pipefail
cd "$(dirname "$0")/data"

DEN_NGAY="${DEN_NGAY:-06/10/2026}"
NSO=https://danhmuchanhchinh.nso.gov.vn

curl -fsSL -o nso_bang_chuyen_doi.xlsx "$NSO/TAPTIN/BangChuyendoi%C4%90VHCmoi_cu_final.xlsx"

soap() {
  curl -fsS -X POST "$NSO/DMDVHC.asmx" \
    -H 'Content-Type: text/xml; charset=utf-8' \
    -H "SOAPAction: \"http://tempuri.org/$1\"" \
    --data "<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><$1 xmlns=\"http://tempuri.org/\"><DenNgay>$DEN_NGAY</DenNgay></$1></soap:Body></soap:Envelope>" \
    -o "$2"
}
soap DanhMucTinh nso_tinh.xml
soap DanhMucPhuongXa nso_phuong_xa.xml

curl -fsSL -o vau_convert_legacy_2025_simple.csv \
  https://raw.githubusercontent.com/tranngocminhhieu/vietnamadminunits/7fac8c45805aad9916b17237c54baf4502303b93/data/interim/convert_legacy_2025_simple.csv

if [[ "${1:-}" == "--update" ]]; then
  shasum -a 256 nso_bang_chuyen_doi.xlsx nso_tinh.xml nso_phuong_xa.xml vau_convert_legacy_2025_simple.csv > SHA256SUMS
fi
shasum -a 256 -c SHA256SUMS
