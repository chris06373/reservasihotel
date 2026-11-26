const STORAGE_KEY = "cjtech_hotel_reservations_v4";

const roomRates = {
  "Deluxe King — 201": 750000,
  "Superior Twin — 105": 550000,
  "Executive Suite — 402": 1350000,
  "Family Room — 308": 980000
};

let reservations = loadReservations();
let isAdminMode = false;
let currentPage = 1;
let pageSize = 5;

function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applyDateConstraints() {
  const today = getTodayISO();
  const checkInEl = document.getElementById("checkIn");
  const checkOutEl = document.getElementById("checkOut");
  const hintEl = document.getElementById("todayHint");

  checkInEl.min = today;
  checkInEl.removeAttribute("max");

  if (hintEl) {
    hintEl.textContent = `Minimal hari ini (${today}) atau tanggal ke depan (tidak bisa mundur).`;
  }

  if (checkInEl.value) {
    checkOutEl.min = checkInEl.value;
  } else {
    checkOutEl.min = today;
  }
}

function loadReservations() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReservations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
}

function clearLocalStorageData() {
  const ok = confirm("Hapus seluruh data reservasi di LocalStorage browser? Data tidak dapat dikembalikan.");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  reservations = [];
  currentPage = 1;
  resetForm();
  renderStats();
  renderList();
}

function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  const diffMs = end - start;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return days >= 0 ? Math.max(1, days) : 1;
}

function getBillingInfo(item) {
  const nights = calculateNights(item.checkIn, item.checkOut);
  const rate = roomRates[item.roomType] || 650000;
  const total = rate * nights;
  let paid = Number(item.paidAmount || 0);
  if (item.paymentStatus === "Lunas" && (item.paidAmount === undefined || item.paidAmount === null || item.paidAmount === "")) {
    paid = total;
  }
  paid = Math.max(0, Math.min(paid, total));
  const balance = Math.max(0, total - paid);
  return { nights, rate, total, paid, balance };
}

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(amount);
}

function isFutureCheckIn(checkInStr) {
  if (!checkInStr) return false;
  return checkInStr > getTodayISO();
}

function isCheckedOut(item) {
  return item.stayStatus === "Selesai (Check-Out)";
}

function canCheckOut(item) {
  const { balance } = getBillingInfo(item);
  return item.paymentStatus === "Lunas" && balance === 0;
}

/* Menandai reservasi yang memang sudah di-booking (belum check-out & memiliki data reservasi valid) */
function isBookedReservation(r) {
  if (!r || !r.id || !r.guestName || !r.roomType || !r.checkIn || !r.checkOut) return false;
  if (r.stayStatus === "Selesai (Check-Out)") return false;
  return true;
}

/* Deteksi Bentrok Tanggal Kamar: hanya terjadi jika sudah ada reservasi yang di-booking pada kamar & rentang tanggal yang sama */
function checkRoomConflict(roomType, checkIn, checkOut, ignoreId = "") {
  if (!Array.isArray(reservations) || reservations.length === 0) return null;
  if (!roomType || !checkIn || !checkOut || checkOut < checkIn) return null;

  const newStart = new Date(checkIn + "T00:00:00").getTime();
  const newEndDay = new Date(checkOut + "T00:00:00").getTime();
  const newEnd = newEndDay === newStart ? newStart + 86400000 : newEndDay;

  return reservations.find((r) => {
    if (!isBookedReservation(r)) return false;
    if (ignoreId && r.id === ignoreId) return false;
    if (r.roomType !== roomType) return false;

    const exStart = new Date(r.checkIn + "T00:00:00").getTime();
    const exEndDay = new Date(r.checkOut + "T00:00:00").getTime();
    const exEnd = exEndDay === exStart ? exStart + 86400000 : exEndDay;

    return newStart < exEnd && newEnd > exStart;
  }) || null;
}

function updateAvailabilityBanner() {
  applyDateConstraints();
  const today = getTodayISO();
  const roomType = document.getElementById("roomType").value;
  const checkIn = document.getElementById("checkIn").value;
  const checkOut = document.getElementById("checkOut").value;
  const editId = document.getElementById("editId").value;

  const banner = document.getElementById("availabilityBanner");
  const textEl = document.getElementById("availabilityText");
  const tagEl = document.getElementById("availabilityTag");

  banner.classList.remove("availability-ok", "availability-conflict", "availability-neutral");

  if (!checkIn || !checkOut) {
    banner.classList.add("availability-neutral");
    textEl.textContent = `Pilih tanggal check-in (minimal ${today}) dan check-out untuk mengecek ketersediaan kamar.`;
    tagEl.className = "badge badge-DP";
    tagEl.textContent = "Menunggu Tanggal";
    return;
  }

  if (checkIn < today) {
    banner.classList.add("availability-conflict");
    textEl.textContent = `Tanggal check-in (${checkIn}) tidak boleh mundur sebelum hari ini (${today}).`;
    tagEl.className = "badge badge-Belum\\ Bayar";
    tagEl.textContent = "Tanggal Mundur";
    return;
  }

  if (checkOut < checkIn) {
    banner.classList.add("availability-conflict");
    textEl.textContent = "Tanggal Check-Out tidak boleh lebih awal dari tanggal Check-In.";
    tagEl.className = "badge badge-Belum\\ Bayar";
    tagEl.textContent = "Tanggal Tidak Valid";
    return;
  }

  const conflict = checkRoomConflict(roomType, checkIn, checkOut, editId);
  if (conflict) {
    banner.classList.add("availability-conflict");
    textEl.textContent = `Bentrok dengan booking ${conflict.id} (${conflict.guestName}, ${conflict.checkIn} s/d ${conflict.checkOut}).`;
    tagEl.className = "badge badge-Belum\\ Bayar";
    tagEl.textContent = "Kamar Bentrok";
  } else {
    banner.classList.add("availability-ok");
    textEl.textContent = `${roomType} tersedia (belum ada yang booking) untuk periode ${checkIn} s/d ${checkOut}.`;
    tagEl.className = "badge badge-Lunas";
    tagEl.textContent = "Tersedia";
  }
}

function syncBillingPreview() {
  const roomType = document.getElementById("roomType").value;
  const checkIn = document.getElementById("checkIn").value;
  const checkOut = document.getElementById("checkOut").value;
  const paymentStatus = document.getElementById("paymentStatus").value;
  const paidInput = document.getElementById("paidAmount");

  const nights = calculateNights(checkIn, checkOut);
  const rate = roomRates[roomType] || 650000;
  const total = rate * nights;

  if (paymentStatus === "Lunas") {
    paidInput.value = total;
  } else if (paymentStatus === "Belum Bayar") {
    paidInput.value = 0;
  } else if (paymentStatus === "DP" && Number(paidInput.value || 0) >= total) {
    paidInput.value = Math.max(0, Math.floor(total * 0.5));
  }

  const paid = Math.max(0, Math.min(Number(paidInput.value || 0), total));
  const balance = Math.max(0, total - paid);

  document.getElementById("previewNights").textContent = `${nights} Malam`;
  document.getElementById("previewTotal").textContent = formatRupiah(total);
  document.getElementById("previewPaid").textContent = formatRupiah(paid);
  document.getElementById("previewBalance").textContent = formatRupiah(balance);
}

function getFilteredData() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const payFilter = document.getElementById("filterPayment").value;
  const stayFilter = document.getElementById("filterStay").value;

  return reservations.filter((item) => {
    const matchText =
      item.guestName.toLowerCase().includes(q) ||
      item.roomType.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.paymentNote && item.paymentNote.toLowerCase().includes(q));
    const matchPay = payFilter === "ALL" || item.paymentStatus === payFilter;
    const matchStay = stayFilter === "ALL" || item.stayStatus === stayFilter;
    return matchText && matchPay && matchStay;
  });
}

function renderStats() {
  document.getElementById("statTotal").textContent = reservations.length;
  const totalNights = reservations.reduce(
    (sum, r) => sum + calculateNights(r.checkIn, r.checkOut),
    0
  );
  document.getElementById("statNights").textContent = `${totalNights} Malam`;
  const paidCount = reservations.filter((r) => r.paymentStatus === "Lunas").length;
  document.getElementById("statPaid").textContent = paidCount;

  const totalBalance = reservations.reduce((sum, r) => {
    if (r.stayStatus === "Selesai (Check-Out)") return sum;
    return sum + getBillingInfo(r).balance;
  }, 0);
  document.getElementById("statBalance").textContent = formatRupiah(totalBalance);
}

function renderPagination(totalItems) {
  const infoEl = document.getElementById("paginationInfo");
  const pagesEl = document.getElementById("paginationPages");

  if (totalItems === 0) {
    infoEl.textContent = "Menampilkan 0 data";
    pagesEl.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  infoEl.textContent = `Menampilkan ${startIdx + 1}–${endIdx} dari ${totalItems} reservasi (Hal ${currentPage} / ${totalPages})`;

  let buttonsHtml = `
    <button type="button" class="page-btn" ${currentPage === 1 ? "disabled" : ""} onclick="goToPage(${currentPage - 1})">Prev</button>
  `;

  for (let p = 1; p <= totalPages; p++) {
    buttonsHtml += `
      <button type="button" class="page-btn ${p === currentPage ? "active" : ""}" onclick="goToPage(${p})">${p}</button>
    `;
  }

  buttonsHtml += `
    <button type="button" class="page-btn" ${currentPage === totalPages ? "disabled" : ""} onclick="goToPage(${currentPage + 1})">Next</button>
  `;

  pagesEl.innerHTML = buttonsHtml;
}

window.goToPage = function (page) {
  currentPage = page;
  renderList();
};

window.quickCheckIn = function (id) {
  const target = reservations.find((r) => r.id === id);
  if (!target) return;
  if (isFutureCheckIn(target.checkIn)) {
    alert(`Check-In belum dapat dilakukan karena tanggal menginap (${target.checkIn}) masih di masa depan.`);
    return;
  }
  reservations = reservations.map((item) =>
    item.id === id ? { ...item, stayStatus: "Aktif Menginap" } : item
  );
  saveReservations();
  renderStats();
  renderList();
  updateAvailabilityBanner();
};

window.quickCheckOut = function (id) {
  const target = reservations.find((r) => r.id === id);
  if (!target) return;
  if (!canCheckOut(target)) {
    const { balance } = getBillingInfo(target);
    alert(
      `Check-Out ditolak: Reservasi ${target.id} belum Lunas (Sisa tagihan: ${formatRupiah(balance)}). Lunasi pembayaran terlebih dahulu.`
    );
    return;
  }
  reservations = reservations.map((item) =>
    item.id === id ? { ...item, stayStatus: "Selesai (Check-Out)" } : item
  );
  saveReservations();
  renderStats();
  renderList();
  updateAvailabilityBanner();
};

window.quickMarkPaid = function (id) {
  const target = reservations.find((r) => r.id === id);
  if (!target || isCheckedOut(target)) return;
  reservations = reservations.map((item) => {
    if (item.id !== id) return item;
    const { total } = getBillingInfo(item);
    return { ...item, paymentStatus: "Lunas", paidAmount: total };
  });
  saveReservations();
  renderStats();
  renderList();
};

function renderList() {
  const filtered = getFilteredData();
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);

  const tbody = document.getElementById("tableBody");
  const mobileList = document.getElementById("mobileList");
  const colSpanCount = isAdminMode ? 9 : 8;

  document.querySelectorAll(".admin-col").forEach((el) => {
    el.classList.toggle("hidden", !isAdminMode);
  });

  if (pageItems.length === 0) {
    const emptyMsg =
      reservations.length === 0
        ? "Belum ada data reservasi."
        : "Tidak ada data reservasi yang cocok dengan filter.";

    tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:24px; color:#6e5046;">${emptyMsg}</td></tr>`;
    mobileList.innerHTML = `<div class="res-mobile-card" style="text-align:center; color:#6e5046;">${emptyMsg}</div>`;
    renderPagination(filtered.length);
    return;
  }

  tbody.innerHTML = pageItems
    .map((item) => {
      const { nights, total, balance } = getBillingInfo(item);
      const badgeClass = `badge-${item.paymentStatus.replace(/\s+/g, "\\ ")}`;
      const checkedOut = isCheckedOut(item);
      const futureCheckIn = isFutureCheckIn(item.checkIn);
      const paidEnoughForCheckout = canCheckOut(item);

      let stayActionBtn = "";
      if (item.stayStatus === "Aktif Menginap") {
        stayActionBtn = `<button type="button" class="btn btn-secondary btn-sm ${paidEnoughForCheckout ? "" : "is-disabled"}" ${paidEnoughForCheckout ? "" : 'disabled title="Hanya bisa Check-Out jika pembayaran sudah Lunas"'} onclick="quickCheckOut('${item.id}')">${paidEnoughForCheckout ? "Check-Out" : "Belum Lunas"}</button>`;
      } else if (!checkedOut) {
        stayActionBtn = `<button type="button" class="btn btn-secondary btn-sm ${futureCheckIn ? "is-disabled" : ""}" ${futureCheckIn ? 'disabled title="Check-in belum tersedia karena jadwal masih di masa depan"' : ""} onclick="quickCheckIn('${item.id}')">Check-In</button>`;
      }

      return `
        <tr>
          <td><strong>${item.id}</strong></td>
          <td>
            <strong>${item.guestName}</strong>
            ${item.paymentNote ? `<br><small style="color:#6e5046;">${item.paymentNote}</small>` : ""}
          </td>
          <td>${item.roomType}</td>
          <td>${item.checkIn} → ${item.checkOut}<br><small style="color:#6e5046;">${nights} Malam</small></td>
          <td>
            <strong>${formatRupiah(total)}</strong><br>
            <small style="color:${balance > 0 ? "#a61c1c" : "#186332"}; font-weight:600;">
              ${balance > 0 ? `Sisa: ${formatRupiah(balance)}` : "Lunas"}
            </small>
          </td>
          <td><span class="badge ${badgeClass}">${item.paymentStatus}</span></td>
          <td>${item.stayStatus}</td>
          <td>
            <button type="button" class="btn btn-outline-red btn-sm" onclick="openInvoice('${item.id}')">Invoice</button>
          </td>
          <td class="admin-col ${isAdminMode ? "" : "hidden"}">
            <div class="action-btns">
              <button type="button" class="btn btn-brown btn-sm ${checkedOut ? "is-disabled" : ""}" ${checkedOut ? 'disabled title="Data yang sudah check-out tidak dapat diedit"' : ""} onclick="startEdit('${item.id}')">Edit</button>
              ${stayActionBtn}
              ${
                balance > 0 && !checkedOut
                  ? `<button type="button" class="btn btn-primary btn-sm" onclick="quickMarkPaid('${item.id}')">Lunasi</button>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  mobileList.innerHTML = pageItems
    .map((item) => {
      const { nights, total, paid, balance } = getBillingInfo(item);
      const badgeClass = `badge-${item.paymentStatus.replace(/\s+/g, "\\ ")}`;
      const checkedOut = isCheckedOut(item);
      const futureCheckIn = isFutureCheckIn(item.checkIn);
      const paidEnoughForCheckout = canCheckOut(item);

      let mobileStayBtn = "";
      if (item.stayStatus === "Aktif Menginap") {
        mobileStayBtn = `<button type="button" class="btn btn-secondary btn-sm ${paidEnoughForCheckout ? "" : "is-disabled"}" style="flex:1;" ${paidEnoughForCheckout ? "" : "disabled"} onclick="quickCheckOut('${item.id}')">${paidEnoughForCheckout ? "Tandai Check-Out" : "Lunasi Dulu u/ Check-Out"}</button>`;
      } else if (!checkedOut) {
        mobileStayBtn = `<button type="button" class="btn btn-secondary btn-sm ${futureCheckIn ? "is-disabled" : ""}" style="flex:1;" ${futureCheckIn ? "disabled" : ""} onclick="quickCheckIn('${item.id}')">${futureCheckIn ? "Check-In Belum Dibuka" : "Tandai Check-In"}</button>`;
      }

      return `
        <div class="res-mobile-card">
          <div class="res-mobile-top">
            <div>
              <small style="color:#8d5342; font-weight:700;">${item.id}</small>
              <div style="font-weight:700; color:#3b1c14; font-size:0.95rem;">${item.guestName}</div>
              <div style="font-size:0.84rem;">${item.roomType}</div>
            </div>
            <span class="badge ${badgeClass}">${item.paymentStatus}</span>
          </div>
          <div class="res-mobile-meta">
            <div><strong>Durasi:</strong> ${nights} Malam</div>
            <div><strong>Histori:</strong> ${item.stayStatus}</div>
            <div><strong>Check-In:</strong> ${item.checkIn}</div>
            <div><strong>Check-Out:</strong> ${item.checkOut}</div>
            <div><strong>Total:</strong> ${formatRupiah(total)}</div>
            <div><strong>Terbayar:</strong> ${formatRupiah(paid)}</div>
            <div style="grid-column: 1 / -1; color:${balance > 0 ? "#a61c1c" : "#186332"};">
              <strong>Sisa Tagihan:</strong> ${formatRupiah(balance)}
            </div>
            ${
              item.paymentNote
                ? `<div style="grid-column: 1 / -1;"><strong>Catatan:</strong> ${item.paymentNote}</div>`
                : ""
            }
          </div>
          <div class="action-btns" style="margin-top:2px;">
            <button type="button" class="btn btn-outline-red btn-sm" style="flex:1;" onclick="openInvoice('${item.id}')">Invoice</button>
            ${
              isAdminMode
                ? `<button type="button" class="btn btn-brown btn-sm ${checkedOut ? "is-disabled" : ""}" style="flex:1;" ${checkedOut ? "disabled" : ""} onclick="startEdit('${item.id}')">${checkedOut ? "Terkunci (Check-Out)" : "Edit Data"}</button>`
                : ""
            }
          </div>
          ${
            isAdminMode && (mobileStayBtn || (balance > 0 && !checkedOut))
              ? `
                <div class="quick-status-row">
                  ${mobileStayBtn}
                  ${
                    balance > 0 && !checkedOut
                      ? `<button type="button" class="btn btn-primary btn-sm" style="flex:1;" onclick="quickMarkPaid('${item.id}')">Tandai Lunas</button>`
                      : ""
                  }
                </div>
              `
              : ""
          }
        </div>
      `;
    })
    .join("");

  renderPagination(filtered.length);
}

function exportExcelHistory() {
  const data = getFilteredData();
  if (data.length === 0) {
    alert("Tidak ada data histori untuk diunduh ke Excel.");
    return;
  }

  const rowsHtml = data
    .map((item) => {
      const { nights, rate, total, paid, balance } = getBillingInfo(item);
      return `
        <tr>
          <td>${item.id}</td>
          <td>${item.guestName}</td>
          <td>${item.roomType}</td>
          <td>${item.checkIn}</td>
          <td>${item.checkOut}</td>
          <td>${nights}</td>
          <td>${rate}</td>
          <td>${total}</td>
          <td>${paid}</td>
          <td>${balance}</td>
          <td>${item.paymentStatus}</td>
          <td>${item.stayStatus}</td>
          <td>${item.paymentNote || "-"}</td>
        </tr>
      `;
    })
    .join("");

  const excelDoc = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8" /></head>
    <body>
      <h3>Histori Menginap — Grand Nusantara Hotel (CJ Tech)</h3>
      <table border="1">
        <thead>
          <tr>
            <th>ID Reservasi</th>
            <th>Nama Tamu</th>
            <th>Kamar</th>
            <th>Check-In</th>
            <th>Check-Out</th>
            <th>Durasi (Malam)</th>
            <th>Tarif / Malam (IDR)</th>
            <th>Total Tagihan (IDR)</th>
            <th>Terbayar (IDR)</th>
            <th>Sisa Tagihan (IDR)</th>
            <th>Status Pembayaran</th>
            <th>Status Histori</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([excelDoc], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `histori-menginap-cjtech-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function fitSingleSheetPrint(targetSelector, baseScale = 0.92) {
  const el = document.querySelector(targetSelector);
  if (!el) return;
  const maxPrintableHeightPx = 1020;
  const rect = el.getBoundingClientRect();
  const currentHeight = el.scrollHeight || rect.height || 1000;
  const ratio = maxPrintableHeightPx / currentHeight;
  const computedScale = Math.max(0.45, Math.min(baseScale, Number(ratio.toFixed(3))));
  document.documentElement.style.setProperty("--print-scale", String(computedScale));
}

function exportPdfHistory() {
  const data = getFilteredData();
  if (data.length === 0) {
    alert("Tidak ada data histori untuk diunduh ke PDF.");
    return;
  }
  fitSingleSheetPrint(".print-report-area", 0.92);
  document.body.classList.add("printing-report");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("printing-report");
    document.documentElement.style.removeProperty("--print-scale");
  }, 500);
}

window.openInvoice = function (id) {
  const item = reservations.find((r) => r.id === id);
  if (!item) return;

  const { nights, rate, total, paid, balance } = getBillingInfo(item);
  const badgeClass = `badge-${item.paymentStatus.replace(/\s+/g, "\\ ")}`;

  document.getElementById("invNumber").textContent = `INV-${item.id}`;
  document.getElementById("invIssuedAt").textContent = `Terbit: ${new Date().toLocaleDateString("id-ID", { dateStyle: "medium" })}`;
  document.getElementById("invCheckIn").textContent = item.checkIn;
  document.getElementById("invCheckOut").textContent = item.checkOut;
  document.getElementById("invDuration").textContent = `${nights} Malam`;
  document.getElementById("invGuest").textContent = item.guestName;
  document.getElementById("invStayStatus").textContent = `Status Menginap: ${item.stayStatus}`;
  document.getElementById("invRoomDesc").textContent = item.roomType;
  document.getElementById("invNote").textContent = item.paymentNote ? `Catatan: ${item.paymentNote}` : "Tidak ada catatan khusus.";
  document.getElementById("invPaymentBadge").innerHTML = `<span class="badge ${badgeClass}">${item.paymentStatus}</span>`;

  document.getElementById("invTableBody").innerHTML = `
    <tr>
      <td>
        <div style="font-weight:700; color:#3b1c14;">${item.roomType}</div>
        <div style="font-size:0.78rem; color:#6e5046;">Periode ${item.checkIn} s/d ${item.checkOut}</div>
      </td>
      <td>${formatRupiah(rate)}</td>
      <td>${nights} Malam</td>
      <td><strong>${formatRupiah(total)}</strong></td>
    </tr>
  `;
  document.getElementById("invGrandTotal").textContent = formatRupiah(total);
  document.getElementById("invPaidAmount").textContent = formatRupiah(paid);
  document.getElementById("invRemainingBalance").textContent = formatRupiah(balance);

  document.getElementById("invoiceModal").classList.remove("hidden");
};

function closeInvoiceModal() {
  document.getElementById("invoiceModal").classList.add("hidden");
}

function setMode(admin) {
  isAdminMode = admin;
  document.getElementById("tabGuest").classList.toggle("active", !admin);
  document.getElementById("tabAdmin").classList.toggle("active", admin);
  document.getElementById("adminSection").classList.toggle("hidden", !admin);
  document.getElementById("modeIndicator").textContent = admin
    ? "Mode Admin (Create & Update)"
    : "Mode Tamu / Resepsionis";

  const quickBar = document.getElementById("mobileQuickBar");
  quickBar.classList.toggle("active-bar", admin);
  document.body.classList.toggle("has-mobile-bar", admin);

  if (!admin) {
    resetForm();
  } else {
    updateAvailabilityBanner();
    syncBillingPreview();
  }
  renderList();
}

function resetForm() {
  document.getElementById("editId").value = "";
  document.getElementById("reservationForm").reset();
  document.getElementById("checkIn").value = getTodayISO();
  document.getElementById("checkOut").value = getTodayISO();
  document.getElementById("paidAmount").value = 0;
  document.getElementById("formHeading").textContent = "Tambah Reservasi Baru (Create)";
  document.getElementById("submitBtn").textContent = "Simpan Reservasi";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  applyDateConstraints();
  updateAvailabilityBanner();
  syncBillingPreview();
}

window.startEdit = function (id) {
  const target = reservations.find((r) => r.id === id);
  if (!target) return;

  if (isCheckedOut(target)) {
    alert("Reservasi yang sudah Selesai (Check-Out) tidak dapat diedit.");
    return;
  }

  const { paid } = getBillingInfo(target);
  setMode(true);
  document.getElementById("editId").value = target.id;
  document.getElementById("guestName").value = target.guestName;
  document.getElementById("roomType").value = target.roomType;
  document.getElementById("checkIn").value = target.checkIn;
  document.getElementById("checkOut").value = target.checkOut;
  document.getElementById("paymentStatus").value = target.paymentStatus;
  document.getElementById("paidAmount").value = paid;
  document.getElementById("stayStatus").value = target.stayStatus;
  document.getElementById("paymentNote").value = target.paymentNote || "";

  document.getElementById("formHeading").textContent = `Edit Reservasi ${target.id} (Update)`;
  document.getElementById("submitBtn").textContent = "Perbarui Data";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  applyDateConstraints();
  updateAvailabilityBanner();
  syncBillingPreview();
  document.getElementById("adminSection").scrollIntoView({ behavior: "smooth" });
};

document.getElementById("reservationForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const today = getTodayISO();
  const editId = document.getElementById("editId").value;
  const guestName = document.getElementById("guestName").value.trim();
  const roomType = document.getElementById("roomType").value;
  const checkIn = document.getElementById("checkIn").value;
  const checkOut = document.getElementById("checkOut").value;
  const paymentStatus = document.getElementById("paymentStatus").value;
  let paidAmount = Math.max(0, Number(document.getElementById("paidAmount").value || 0));
  const stayStatus = document.getElementById("stayStatus").value;
  const paymentNote = document.getElementById("paymentNote").value.trim();

  if (!guestName) {
    alert("Nama tamu wajib diisi.");
    return;
  }

  if (editId) {
    const existing = reservations.find((r) => r.id === editId);
    if (existing && isCheckedOut(existing)) {
      alert("Reservasi yang sudah check-out tidak dapat diedit.");
      resetForm();
      return;
    }
  }

  if (!checkIn || checkIn < today) {
    alert(`Tanggal check-in (${checkIn || "-"}) tidak boleh mundur sebelum hari ini (${today}). Pilih hari ini atau tanggal ke depan.`);
    return;
  }

  if (checkOut < checkIn) {
    alert("Tanggal Check-Out tidak boleh lebih awal dari tanggal Check-In.");
    return;
  }

  if (stayStatus === "Aktif Menginap" && checkIn > today) {
    alert("Status Aktif Menginap tidak dapat dipilih untuk tanggal check-in di masa depan.");
    return;
  }

  const nights = calculateNights(checkIn, checkOut);
  const rate = roomRates[roomType] || 650000;
  const totalTagihan = rate * nights;

  if (paymentStatus === "Lunas") {
    paidAmount = totalTagihan;
  } else if (paymentStatus === "Belum Bayar") {
    paidAmount = 0;
  }

  const sisaTagihan = Math.max(0, totalTagihan - Math.min(paidAmount, totalTagihan));

  if (stayStatus === "Selesai (Check-Out)" && (paymentStatus !== "Lunas" || sisaTagihan > 0)) {
    alert(
      `Status Selesai (Check-Out) hanya dapat dipilih jika pembayaran sudah Lunas (Sisa tagihan saat ini: ${formatRupiah(sisaTagihan)}).`
    );
    return;
  }

  const conflict = checkRoomConflict(roomType, checkIn, checkOut, editId);
  if (conflict) {
    const proceed = confirm(
      `Peringatan: ${roomType} sudah di-booking oleh ${conflict.guestName} (${conflict.id}, ${conflict.checkIn} s/d ${conflict.checkOut}). Tetap simpan data?`
    );
    if (!proceed) return;
  }

  if (editId) {
    reservations = reservations.map((item) =>
      item.id === editId
        ? { ...item, guestName, roomType, checkIn, checkOut, paymentStatus, paidAmount, stayStatus, paymentNote }
        : item
    );
  } else {
    const uniqueSuffix = String(Date.now()).slice(-4);
    reservations.unshift({
      id: `RSV-${uniqueSuffix}`,
      guestName,
      roomType,
      checkIn,
      checkOut,
      paymentStatus,
      paidAmount,
      stayStatus,
      paymentNote
    });
    currentPage = 1;
  }

  saveReservations();
  renderStats();
  renderList();
  resetForm();
});

["roomType", "checkIn", "checkOut"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    if (id === "checkIn") {
      const checkInEl = document.getElementById("checkIn");
      const checkOutEl = document.getElementById("checkOut");
      if (checkInEl.value) {
        checkOutEl.min = checkInEl.value;
        if (checkOutEl.value && checkOutEl.value < checkInEl.value) {
          checkOutEl.value = checkInEl.value;
        }
      }
    }
    updateAvailabilityBanner();
    syncBillingPreview();
  });
});

["paymentStatus", "paidAmount"].forEach((id) => {
  document.getElementById(id).addEventListener("input", syncBillingPreview);
  document.getElementById(id).addEventListener("change", syncBillingPreview);
});

document.getElementById("quickFocusFormBtn").addEventListener("click", () => {
  document.getElementById("adminSection").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("quickScrollListBtn").addEventListener("click", () => {
  document.getElementById("listSection").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("cancelEditBtn").addEventListener("click", resetForm);
document.getElementById("tabGuest").addEventListener("click", () => setMode(false));
document.getElementById("tabAdmin").addEventListener("click", () => setMode(true));
document.getElementById("clearStorageBtn").addEventListener("click", clearLocalStorageData);
document.getElementById("exportExcelBtn").addEventListener("click", exportExcelHistory);
document.getElementById("exportPdfBtn").addEventListener("click", exportPdfHistory);
document.getElementById("closeInvoiceBtn").addEventListener("click", closeInvoiceModal);

document.getElementById("printInvoiceBtn").addEventListener("click", () => {
  fitSingleSheetPrint(".modal-card", 0.94);
  document.body.classList.add("printing-invoice");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("printing-invoice");
    document.documentElement.style.removeProperty("--print-scale");
  }, 500);
});

document.getElementById("invoiceModal").addEventListener("click", (e) => {
  if (e.target.id === "invoiceModal") closeInvoiceModal();
});

document.getElementById("searchInput").addEventListener("input", () => {
  currentPage = 1;
  renderList();
});

document.getElementById("filterPayment").addEventListener("change", () => {
  currentPage = 1;
  renderList();
});

document.getElementById("filterStay").addEventListener("change", () => {
  currentPage = 1;
  renderList();
});

document.getElementById("pageSizeSelect").addEventListener("change", (e) => {
  pageSize = Number(e.target.value) || 5;
  currentPage = 1;
  renderList();
});

document.getElementById("checkIn").value = getTodayISO();
document.getElementById("checkOut").value = getTodayISO();
applyDateConstraints();
updateAvailabilityBanner();
syncBillingPreview();
renderStats();
renderList();
