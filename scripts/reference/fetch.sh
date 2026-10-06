#!/usr/bin/env bash
# Downloads the NSO admin unit sources into data/ and checks them against data/SHA256SUMS.
#   fetch.sh            download, then verify
#   fetch.sh --verify   verify the committed files only, with no network
#   fetch.sh --update   download, then rewrite SHA256SUMS after a deliberate refresh
# DEN_NGAY pins the catalog date (dd/MM/yyyy). The NAPAS BIN snapshot is refreshed by hand,
# never fetched: the portal's terms bar automated collection.
set -euo pipefail
cd "$(dirname "$0")/data"

mode="${1:-fetch}"
case "$mode" in
  fetch | --update | --verify) ;;
  *) echo "usage: $0 [--verify | --update]" >&2; exit 2 ;;
esac

if [[ "$mode" != "--verify" ]]; then
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
fi

if [[ "$mode" == "--update" ]]; then
  shasum -a 256 napas_bins.json nso_bang_chuyen_doi.xlsx nso_phuong_xa.xml nso_tinh.xml > SHA256SUMS
fi
shasum -a 256 -c SHA256SUMS
