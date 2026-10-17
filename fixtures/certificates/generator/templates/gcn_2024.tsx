import { area, Field, Heading, holderLine, Line, NationalHeader, Page, provinceOf, Signature, Table, Title, type CertificateTemplate, type Palette } from './parts.tsx';

const palette: Palette = { paper: '#fbf1ee', frame: '#c0392b', ink: '#26191a' };

export const gcn2024: CertificateTemplate = {
  handwritten: false,
  pages: [
    {
      sections: ['qr', 'holders', 'parcels', 'structures', 'notes_text', 'issued', 'book_entry_no', 'serial_no'],
      render: (facts, qrDataUrl) => (
        <Page palette={palette}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {qrDataUrl === null ? <div style={{ display: 'flex' }} /> : <img src={qrDataUrl} width={150} height={150} />}
            <NationalHeader />
            <div style={{ display: 'flex', width: 150 }} />
          </div>
          <Title color={palette.frame}>GIẤY CHỨNG NHẬN QUYỀN SỬ DỤNG ĐẤT, QUYỀN SỞ HỮU TÀI SẢN GẮN LIỀN VỚI ĐẤT</Title>
          <Heading>1. Người sử dụng đất, chủ sở hữu tài sản gắn liền với đất</Heading>
          {facts.holders.map((holder, index) => (
            <Line key={holder.id_number}>{holderLine(holder, index === 0 ? 'Ông' : 'Bà')}</Line>
          ))}
          <Field label="Địa chỉ" value={facts.holders[0]?.address_text ?? null} />
          <Heading>2. Thông tin thửa đất</Heading>
          {facts.parcels.map((parcel) => (
            <div key={parcel.parcel_no} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Field label="Thửa đất số" value={parcel.parcel_no} />
                <Field label="Tờ bản đồ số" value={parcel.map_sheet_no} />
                <Field label="Diện tích" value={area(parcel.area_m2)} />
              </div>
              <Field label="Địa chỉ" value={parcel.address_text} />
              <Field label="Hình thức sử dụng" value={parcel.use_form} />
              <Field label="Loại đất" value={parcel.purposes.map((purpose) => `${purpose.land_use_code} ${area(purpose.area_m2)}`).join('; ')} />
              <Field label="Thời hạn sử dụng" value={parcel.purposes.map((purpose) => purpose.term).join('; ')} />
              <Field label="Nguồn gốc sử dụng" value={parcel.origin_text} />
            </div>
          ))}
          <Heading>3. Thông tin tài sản gắn liền với đất</Heading>
          {facts.structures.map((structure) => (
            <Table
              key={structure.kind}
              columns={['Loại tài sản', 'Diện tích xây dựng', 'Diện tích sàn', 'Số tầng', 'Kết cấu', 'Năm hoàn thành', 'Thời hạn sở hữu']}
              rows={[
                [
                  structure.kind,
                  structure.footprint_m2 === null ? '-' : area(structure.footprint_m2),
                  structure.floor_area_m2 === null ? '-' : area(structure.floor_area_m2),
                  structure.floors === null ? '-' : String(structure.floors),
                  structure.structure_text ?? '-',
                  structure.completed_year === null ? '-' : String(structure.completed_year),
                  structure.ownership_term ?? '-',
                ],
              ]}
            />
          ))}
          <Field label="4. Ghi chú" value={facts.notes_text} />
          <Signature place={provinceOf(facts)} issuedOn={facts.issued_on} issuedBy={facts.issued_by} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
            <Field label="Số vào sổ cấp Giấy chứng nhận" value={facts.book_entry_no} />
            <Field label="Số phát hành" value={facts.serial_no} />
          </div>
        </Page>
      ),
    },
    {
      sections: ['annotations'],
      render: () => (
        <Page palette={palette}>
          <Heading>5. Sơ đồ thửa đất</Heading>
          <div style={{ display: 'flex', height: 480, border: '1px dashed currentColor', margin: '8px 0 20px' }} />
          <Heading>6. Những thay đổi sau khi cấp Giấy chứng nhận</Heading>
          <Table columns={['Nội dung thay đổi và cơ sở pháp lý', 'Xác nhận của cơ quan có thẩm quyền']} rows={[['', ''], ['', '']]} />
        </Page>
      ),
    },
  ],
};
