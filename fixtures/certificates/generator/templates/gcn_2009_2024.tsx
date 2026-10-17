import { area, date, Field, Heading, holderLine, Line, NationalHeader, Page, provinceOf, Signature, Table, Title, type CertificateTemplate, type Palette } from './parts.tsx';

const palette: Palette = { paper: '#fdeef0', frame: '#d0546b', ink: '#2a1b1e' };

export const gcn20092024: CertificateTemplate = {
  handwritten: false,
  pages: [
    {
      sections: ['holders', 'serial_no'],
      render: (facts) => (
        <Page palette={palette}>
          <NationalHeader />
          <Title color={palette.frame}>GIẤY CHỨNG NHẬN QUYỀN SỬ DỤNG ĐẤT, QUYỀN SỞ HỮU NHÀ Ở VÀ TÀI SẢN KHÁC GẮN LIỀN VỚI ĐẤT</Title>
          <Heading>I. Người sử dụng đất, chủ sở hữu nhà ở và tài sản khác gắn liền với đất</Heading>
          {facts.holders.map((holder) => (
            <div key={holder.id_number} style={{ display: 'flex', flexDirection: 'column' }}>
              <Line>{holderLine(holder, 'Bà')}</Line>
              <Field label="Địa chỉ thường trú" value={holder.address_text} />
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto' }}>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#b71c1c', letterSpacing: 2 }}>{facts.serial_no ?? ''}</div>
          </div>
        </Page>
      ),
    },
    {
      sections: ['parcels', 'structures', 'notes_text', 'issued', 'book_entry_no'],
      render: (facts) => (
        <Page palette={palette}>
          <Heading>II. Thửa đất, nhà ở và tài sản khác gắn liền với đất</Heading>
          {facts.parcels.map((parcel) => (
            <div key={parcel.parcel_no} style={{ display: 'flex', flexDirection: 'column' }}>
              <Line>1. Thửa đất:</Line>
              <Field label="a) Thửa đất số" value={parcel.parcel_no} />
              <Field label="b) Tờ bản đồ số" value={parcel.map_sheet_no} />
              <Field label="c) Địa chỉ" value={parcel.address_text} />
              <Field label="d) Diện tích" value={area(parcel.area_m2)} />
              <Field label="đ) Hình thức sử dụng" value={parcel.use_form} />
              <Field label="e) Mục đích sử dụng" value={parcel.purposes.map((purpose) => `${purpose.land_use_code} ${area(purpose.area_m2)}`).join('; ')} />
              <Field label="g) Thời hạn sử dụng" value={parcel.purposes.map((purpose) => `${purpose.land_use_code}: ${purpose.term}`).join('; ')} />
              <Field label="h) Nguồn gốc sử dụng" value={parcel.origin_text} />
            </div>
          ))}
          {facts.structures.map((structure) => (
            <div key={structure.kind} style={{ display: 'flex', flexDirection: 'column' }}>
              <Line>2. Nhà ở:</Line>
              <Table
                columns={['Loại nhà ở', 'Diện tích xây dựng', 'Diện tích sàn', 'Kết cấu', 'Số tầng', 'Năm hoàn thành', 'Thời hạn sở hữu']}
                rows={[
                  [
                    structure.kind,
                    structure.footprint_m2 === null ? '-' : area(structure.footprint_m2),
                    structure.floor_area_m2 === null ? '-' : area(structure.floor_area_m2),
                    structure.structure_text ?? '-',
                    structure.floors === null ? '-' : String(structure.floors),
                    structure.completed_year === null ? '-' : String(structure.completed_year),
                    structure.ownership_term ?? '-',
                  ],
                ]}
              />
            </div>
          ))}
          <Field label="Ghi chú" value={facts.notes_text} />
          <Signature place={provinceOf(facts)} issuedOn={facts.issued_on} issuedBy={facts.issued_by} />
          <div style={{ display: 'flex', marginTop: 'auto' }}>
            <Field label="Số vào sổ cấp GCN" value={facts.book_entry_no} />
          </div>
        </Page>
      ),
    },
    {
      sections: ['annotations'],
      render: (facts) => (
        <Page palette={palette}>
          <Heading>III. Sơ đồ thửa đất, nhà ở và tài sản khác gắn liền với đất</Heading>
          <div style={{ display: 'flex', height: 420, border: '1px dashed currentColor', margin: '8px 0 20px' }} />
          <Heading>IV. Những thay đổi sau khi cấp giấy chứng nhận</Heading>
          <Table
            columns={['Nội dung thay đổi và cơ sở pháp lý', 'Xác nhận của cơ quan có thẩm quyền']}
            rows={[...facts.annotations.map((annotation) => [annotation.text, `Ngày ${date(annotation.date)}. Văn phòng đăng ký đất đai`]), ['', '']]}
          />
        </Page>
      ),
    },
  ],
};
