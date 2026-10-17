import { area, Field, Heading, holderLine, Line, NationalHeader, Page, Signature, Table, Title, type CertificateTemplate, type Palette } from './parts.tsx';

const palette: Palette = { paper: '#fbeee9', frame: '#b3261e', ink: '#2b1d1a' };

export const soDoPre2009: CertificateTemplate = {
  handwritten: false,
  pages: [
    {
      sections: ['holders', 'parcels', 'issued', 'book_entry_no', 'serial_no'],
      render: (facts) => (
        <Page palette={palette}>
          <NationalHeader />
          <Title color={palette.frame}>GIẤY CHỨNG NHẬN QUYỀN SỬ DỤNG ĐẤT</Title>
          <Line>{`${facts.issued_by ?? ''} chứng nhận quyền sử dụng đất cho:`}</Line>
          <Heading>I. Người sử dụng đất</Heading>
          {facts.holders.map((holder) => (
            <div key={holder.id_number} style={{ display: 'flex', flexDirection: 'column' }}>
              <Line>{holderLine(holder, 'Hộ ông')}</Line>
              <Field label="Địa chỉ thường trú" value={holder.address_text} />
            </div>
          ))}
          <Heading>II. Thửa đất được quyền sử dụng</Heading>
          {facts.parcels.map((parcel) => (
            <div key={parcel.parcel_no} style={{ display: 'flex', flexDirection: 'column' }}>
              <Table
                columns={['Thửa đất số', 'Tờ bản đồ số', 'Diện tích', 'Mục đích sử dụng', 'Thời hạn sử dụng']}
                rows={parcel.purposes.map((purpose) => [parcel.parcel_no ?? '', parcel.map_sheet_no ?? '', area(purpose.area_m2), purpose.land_use_code, purpose.term])}
              />
              <Field label="Tổng diện tích" value={area(parcel.area_m2)} />
              <Field label="Địa chỉ thửa đất" value={parcel.address_text} />
              <Field label="Hình thức sử dụng" value={parcel.use_form} />
              <Field label="Nguồn gốc sử dụng" value={parcel.origin_text} />
            </div>
          ))}
          <Signature place="Củ Chi" issuedOn={facts.issued_on} issuedBy={facts.issued_by} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
            <Field label="Vào sổ cấp giấy chứng nhận số" value={facts.book_entry_no} />
            <Field label="Số" value={facts.serial_no} />
          </div>
        </Page>
      ),
    },
    {
      sections: ['annotations', 'notes_text'],
      render: () => (
        <Page palette={palette}>
          <Heading>III. Những thay đổi sau khi cấp giấy chứng nhận</Heading>
          <Table columns={['Ngày, tháng, năm', 'Nội dung thay đổi và cơ sở pháp lý', 'Xác nhận của cơ quan có thẩm quyền']} rows={[['', '', ''], ['', '', ''], ['', '', '']]} />
          <Heading>Những điều cần chú ý</Heading>
          <Line>1. Người sử dụng đất phải giữ gìn giấy chứng nhận, không được tự ý sửa chữa, tẩy xóa.</Line>
          <Line>2. Khi chuyển quyền sử dụng đất phải đăng ký tại cơ quan có thẩm quyền.</Line>
        </Page>
      ),
    },
  ],
};
