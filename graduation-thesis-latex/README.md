# Graduation Thesis Form Template (LaTeX) — per VKU Regulation 675

Mẫu **form trống** cho **ĐỒ ÁN TỐT NGHIỆP** (Graduation Thesis),
Khoa Khoa học Máy tính — định dạng theo **Quy định trình bày cuốn báo
cáo đồ án, khóa luận tốt nghiệp (Mẫu 3, Quyết định 675/QĐ-ĐHVKU)**.
Chỉ gồm bìa, các trang đầu, dàn mục và định dạng — **không có nội
dung chính**, bạn tự điền nội dung vào.

## Định dạng theo QĐ 675

- A4 (210×297 mm), in một mặt; **lề trên 2 cm, dưới 2 cm, trái 3 cm,
  phải 2 cm** cho toàn văn
- Times New Roman **13 pt**, giãn dòng **1.3**, cách đoạn **6 pt**; tiêu đề chương và các tiêu đề lớn bắt đầu đúng tại lề trên 2 cm (đã bù khoảng đệm dòng của LaTeX cho khớp cách Word bỏ khoảng cách đầu trang),
  căn đều hai bên, thụt đầu dòng 1,27 cm
- Nội dung chính (từ Mở đầu/Chương 1 đến Kết luận): **40–70 trang**
- Tiêu đề chương cùng một hàng, ví dụ `CHAPTER 1. INTRODUCTION`:
  **16 pt**, đậm, đứng, viết hoa, căn giữa (QĐ cho phép 15 hoặc 16)
- Đề mục đánh số tối đa 4 chữ số (1.1.1.1); mỗi nhóm phải có ít nhất
  2 đề mục con:
  - `1.1.` — **VIẾT HOA**, đậm, đứng (14 pt)
  - `1.1.1.` — chữ thường, **đậm**, đứng (13 pt)
  - `1.1.1.1.` — chữ thường, **đậm, nghiêng** (13 pt)
- Hình/bảng đánh số theo chương (Figure 2.1, Table 2.1); **caption
  bảng ở trên bảng, caption hình ở dưới hình**, chữ thường (không
  đậm/nghiêng), căn giữa, cỡ bằng cỡ chữ nội dung (13 pt); bảng/hình
  lấy từ nguồn khác phải ghi nguồn đầy đủ
- Đoạn trích dài (hơn 2 câu): tách đoạn riêng, lùi lề trái thêm 2 cm,
  không dùng ngoặc kép

## Đánh số trang & header/footer (QĐ 675, mục 1 và 9)

- Trang đầu (số La Mã, ở **góc dưới phải**, không header/footer):
  Acknowledgement **i** → Table of Contents **ii** → List of
  Abbreviations **iii** → List of Tables **iv** → List of Figures **v**
  (mục lục dài hơn 1 trang thì các số sau tự dồn tiếp)
- Phần chính (số Ả Rập từ **1**, bắt đầu từ Chương 1 đến hết Chương 5):
  có **header** = tên đề tài rút gọn (nghiêng, 11 pt, có gạch dưới) và
  **footer** = gạch trên + “Họ tên SV – Lớp” (nghiêng, 11 pt) bên trái,
  số trang bên phải
- **References và Appendices**: số La Mã **tiếp nối** dãy trên
  (References bắt đầu từ vi — hoặc vii nếu mục lục 2 trang), góc dưới
  phải, không header/footer

## Cấu trúc form (thứ tự theo QĐ 675)

```
Bìa chính + Bìa phụ (giống hệt nhau, khung 1 nét):
  Tên trường (thường) / KHOA (đậm 16) / logo VKU /
  GRADUATION THESIS (đậm 25) / THESIS TITLE: ... (đậm 16) /
  Student - Class - Major - Specialization - Supervisor (14) /
  Danang - 05/2026
Acknowledgement (i)
Table of Contents (ii)
List of Abbreviations (iii, tuỳ chọn)
List of Tables (iv) - List of Figures (v)
CHAPTER 1. INTRODUCTION — gồm đủ 5 nội dung “Mở đầu” theo QĐ 675
  mục 4: Motivation / Objectives / Scope / Research Methods /
  Scientific and Practical Significance
CHAPTER 2. LITERATURE REVIEW AND BACKGROUND
CHAPTER 3. PRODUCT DESIGN AND DEVELOPMENT
CHAPTER 4. DEPLOYMENT AND BUSINESS MODELS
CHAPTER 5. CONCLUSION AND RECOMMENDATIONS
REFERENCES — kiểu QĐ 675 (xem dưới)
APPENDICES (tuỳ chọn)
```

## Tài liệu tham khảo — kiểu QĐ 675, mục 3.4 (thay cho APA)

- Đánh số **liên tục** [1], [2], [3]… cho mọi ngôn ngữ; xếp theo
  **nhóm ngôn ngữ** (tiếng Việt trước, rồi ngôn ngữ khác), trong nhóm
  xếp ABC theo tác giả
- Sách/báo cáo: `Author (Year), *Title* (nghiêng), Publisher, Place.`
- Bài báo: `Author (Year), "Article title", *Journal*, Vol (No),
  pp. xx–yy.`
- Web: ghi URL cụ thể + ngày truy cập
- Dòng tiếp theo của mỗi mục **thụt vào 1 cm** (đã cài sẵn trong mẫu)
- Trích dẫn trong bài theo số trong ngoặc vuông: `\cite{key}` → [1];
  kèm trang: `\cite[pp.~314--315]{key}` → [1, pp. 314–315]; nhiều
  nguồn viết riêng từng ngoặc: [19], [25], [41]

## Cách dùng

- **Overleaf:** tải file zip lên (New Project → Upload Project),
  Compiler = **XeLaTeX**, Main document = `main.tex`, Recompile
  **3–4 lần** (để mục lục và dãy số La Mã của References ổn định).
- **Máy cá nhân:** `xelatex main` × 3–4 lần (không cần Biber nữa).
- **Thông tin bìa + header:** sửa khối `THESIS INFORMATION` ở đầu
  `main.tex` (tên đề tài, sinh viên + MSSV, lớp, Ngành, Chuyên ngành,
  GVHD, tháng/năm; `\HeaderTitle` là tên đề tài rút gọn chạy ở header,
  `\AuthorLine` là dòng “Họ tên – Lớp” ở footer).
- Logo VKU: bỏ file `logo.png` vào `figures/` rồi bỏ comment dòng
  `\includegraphics` trong `frontmatter/cover.tex`.
- Hình ảnh khác bỏ vào thư mục `figures/`.

```
graduation-thesis-latex/
├── main.tex               ← file chính: thông tin bìa + định dạng
├── frontmatter/           ← cover, acknowledgement, abbreviations
├── chapters/              ← chapter01..05 (chỉ dàn mục), references, appendix
└── figures/               ← hình ảnh + logo
```
