// ---------- Load shared header/footer partials ----------
async function loadPartial(placeholderId, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load ' + url);
    document.getElementById(placeholderId).outerHTML = await res.text();
  } catch (err) {
    console.error(err);
  }
}
loadPartial('header-placeholder', '/partials/header.html');
loadPartial('footer-placeholder', '/partials/footer.html');

// ---------- Fade in sections as they scroll into view ----------
(function () {
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sections = document.querySelectorAll('.fade-section');

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    sections.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  sections.forEach(function (el) { observer.observe(el); });
})();

// ---------- Musician search filter (only runs if the search box exists) ----------
(function () {
  var input = document.getElementById('musician-search');
  var grid = document.getElementById('musician-grid');
  if (!input || !grid) return;

  var cards = grid.querySelectorAll('.channel');
  var emptyMsg = document.getElementById('musician-search-empty');

  input.addEventListener('input', function () {
    var term = input.value.trim().toLowerCase();
    var visibleCount = 0;

    cards.forEach(function (card) {
      var match = card.textContent.toLowerCase().indexOf(term) !== -1;
      card.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });

    if (emptyMsg) emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';
  });
})();
// ---------- Supabase setup ----------
const SUPABASE_URL = 'https://cgpdzgktbljgfphyahqr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_va9EhlGXjJh6weSzOhZT9w_urypbpmt';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('settlement-form');
  if (!form) return; // safety: only run on the settlement page

  // ---------- Currency helper ----------
  function money(n) {
    var v = isFinite(n) ? n : 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isFinite(v) ? v : 0;
  }

  // ---------- Deal-type conditional fields ----------
  var dealRadios = form.querySelectorAll('input[name="deal_type"]');
  var conditionalBlocks = form.querySelectorAll('.conditional-block');

  function updateConditionalBlocks() {
    var selected = form.querySelector('input[name="deal_type"]:checked').value;
    conditionalBlocks.forEach(function (block) {
      var showFor = block.getAttribute('data-shows-for').split(',');
      block.classList.toggle('is-active', showFor.indexOf(selected) !== -1);
    });
    recalculate();
  }
  dealRadios.forEach(function (r) { r.addEventListener('change', updateConditionalBlocks); });

  // ---------- Keep venue % synced to artist % ----------
  var artistPctInput = document.getElementById('artist_percentage');
  var venuePctInput = document.getElementById('venue_percentage');
  if (artistPctInput) {
    artistPctInput.addEventListener('input', function () {
      var a = parseFloat(artistPctInput.value);
      if (!isFinite(a)) a = 0;
      venuePctInput.value = Math.max(0, 100 - a);
      recalculate();
    });
  }

  // ---------- Deductions (dynamic rows) ----------
  var deductionsList = document.getElementById('deductions-list');
  var addDeductionBtn = document.getElementById('add-deduction');

  function addDeductionRow(description, amount) {
    var row = document.createElement('div');
    row.className = 'deduction-row';
    row.innerHTML =
      '<input type="text" class="deduction-desc" placeholder="e.g. Hotel, bar tab, security…" value="' +
      (description ? description.replace(/"/g, '&quot;') : '') + '">' +
      '<input type="number" class="deduction-amount" placeholder="0.00" step="0.01" min="0" value="' +
      (amount || '') + '">' +
      '<button type="button" class="remove-row-btn" aria-label="Remove">×</button>';

    row.querySelector('.remove-row-btn').addEventListener('click', function () {
      row.remove();
      recalculate();
    });
    row.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('input', recalculate);
    });

    deductionsList.appendChild(row);
  }

  addDeductionBtn.addEventListener('click', function () { addDeductionRow('', ''); });
  addDeductionRow('', ''); // start with one empty row

  function getDeductions() {
    var rows = deductionsList.querySelectorAll('.deduction-row');
    var items = [];
    rows.forEach(function (row) {
      var desc = row.querySelector('.deduction-desc').value.trim();
      var amt = parseFloat(row.querySelector('.deduction-amount').value);
      if (!isFinite(amt)) amt = 0;
      if (desc || amt) items.push({ description: desc, amount: amt });
    });
    return items;
  }

  // ---------- Payout split (dynamic rows) ----------
  var payeesList = document.getElementById('payees-list');
  var addPayeeBtn = document.getElementById('add-payee');
  var splitEvenlyBtn = document.getElementById('split-evenly');
  var payeeWarning = document.getElementById('payee-split-warning');

  function addPayeeRow(name, percentage) {
    var row = document.createElement('div');
    row.className = 'payee-row';
    row.innerHTML =
      '<input type="text" class="payee-name" placeholder="Name">' +
      '<input type="number" class="payee-pct" placeholder="%" min="0" max="100" step="0.1" value="' +
      (percentage || '') + '">' +
      '<span class="payee-amount">$0.00</span>' +
      '<button type="button" class="remove-row-btn" aria-label="Remove">×</button>';

    row.querySelector('.payee-name').value = name || '';

    row.querySelector('.remove-row-btn').addEventListener('click', function () {
      row.remove();
      recalculate();
    });
    row.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('input', recalculate);
    });

    payeesList.appendChild(row);
  }

  addPayeeBtn.addEventListener('click', function () { addPayeeRow('', ''); recalculate(); });
  splitEvenlyBtn.addEventListener('click', function () {
    var rows = payeesList.querySelectorAll('.payee-row');
    if (rows.length === 0) return;
    var each = 100 / rows.length;
    rows.forEach(function (row, i) {
      // last row absorbs any rounding remainder so it totals exactly 100
      var pct = (i === rows.length - 1)
        ? 100 - Math.round(each * 100) / 100 * (rows.length - 1)
        : Math.round(each * 100) / 100;
      row.querySelector('.payee-pct').value = pct;
    });
    recalculate();
  });
  addPayeeRow('', ''); // start with one empty row

  function getPayees(totalDue) {
    var rows = payeesList.querySelectorAll('.payee-row');
    var items = [];
    var pctSum = 0;
    rows.forEach(function (row) {
      var name = row.querySelector('.payee-name').value.trim();
      var pct = parseFloat(row.querySelector('.payee-pct').value);
      if (!isFinite(pct)) pct = 0;
      var amount = totalDue * (pct / 100);
      row.querySelector('.payee-amount').textContent = money(amount);
      if (name || pct) {
        items.push({ name: name, percentage: pct, amount: amount });
        pctSum += pct;
      }
    });

    if (items.length > 0 && Math.abs(pctSum - 100) > 0.5) {
      payeeWarning.style.display = 'block';
      payeeWarning.className = 'status-message error';
      payeeWarning.textContent = 'Splits total ' + pctSum.toFixed(1) + '% — should add up to 100%.';
    } else {
      payeeWarning.style.display = 'none';
    }

    return items;
  }

  // ---------- Live calculation ----------
  function recalculate() {
    var dealType = form.querySelector('input[name="deal_type"]:checked').value;
    var guaranteeAmt = num('guarantee_amount');
    var ticketPrice = num('ticket_price');
    var ticketsSold = num('tickets_sold');
    var grossRevenue = ticketPrice * ticketsSold;
    var artistPct = num('artist_percentage');
    var doorEarnings = grossRevenue * (artistPct / 100);

    var totalEarned = 0;
    if (dealType === 'guarantee') totalEarned = guaranteeAmt;
    else if (dealType === 'door_split') totalEarned = doorEarnings;
    else if (dealType === 'versus') totalEarned = Math.max(guaranteeAmt, doorEarnings);

    var deductions = getDeductions();
    var totalDeductions = deductions.reduce(function (sum, d) { return sum + d.amount; }, 0);

    var merchGross = num('merch_gross');
    var merchVenuePct = num('merch_venue_percentage');
    var merchNet = merchGross * (1 - merchVenuePct / 100);

    var depositPaid = num('deposit_paid');

    var totalDue = totalEarned - totalDeductions + merchNet - depositPaid;

    var payees = getPayees(totalDue);

    document.getElementById('sum-earned').textContent = money(totalEarned);
    document.getElementById('sum-deductions').textContent = '–' + money(totalDeductions);
    document.getElementById('sum-merch').textContent = '+' + money(merchNet);
    document.getElementById('sum-deposit').textContent = '–' + money(depositPaid);
    document.getElementById('sum-total').textContent = money(totalDue);

    return {
      dealType: dealType, guaranteeAmt: guaranteeAmt, grossRevenue: grossRevenue,
      totalEarned: totalEarned, deductions: deductions, totalDeductions: totalDeductions,
      merchGross: merchGross, merchVenuePct: merchVenuePct, merchNet: merchNet,
      depositPaid: depositPaid, totalDue: totalDue, payees: payees
    };
  }

  form.addEventListener('input', function (e) {
    // deduction row inputs already trigger recalculate individually;
    // this covers all the other fields.
    recalculate();
  });

  updateConditionalBlocks(); // sets initial visible blocks + first calculation

  // ---------- Save to Supabase ----------
  var statusEl = document.getElementById('save-status');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var totals = recalculate();
    var saveBtn = document.getElementById('save-settlement');
    saveBtn.disabled = true;
    statusEl.textContent = 'Saving…';
    statusEl.className = 'status-message';

    var payload = {
      venue_name: document.getElementById('venue_name').value,
      city: document.getElementById('city').value,
      show_date: document.getElementById('show_date').value || null,
      artist_name: document.getElementById('artist_name').value,
      promoter_name: document.getElementById('promoter_name').value,
      capacity: parseInt(document.getElementById('capacity').value) || null,

      deal_type: totals.dealType,
      guarantee_amount: totals.guaranteeAmt,

      ticket_price: num('ticket_price'),
      tickets_sold: parseInt(document.getElementById('tickets_sold').value) || 0,
      comps_issued: parseInt(document.getElementById('comps_issued').value) || 0,
      gross_revenue: totals.grossRevenue,
      artist_percentage: num('artist_percentage'),
      venue_percentage: num('venue_percentage'),

      deductions: totals.deductions,
      total_deductions: totals.totalDeductions,

      payees: totals.payees,

      merch_gross: totals.merchGross,
      merch_venue_percentage: totals.merchVenuePct,
      merch_net_to_artist: totals.merchNet,

      deposit_paid: totals.depositPaid,
      total_due: totals.totalDue,
      payment_method: document.getElementById('payment_method').value,

      promoter_signature_name: document.getElementById('promoter_signature_name').value,
      artist_signature_name: document.getElementById('artist_signature_name').value,
      notes: document.getElementById('notes').value
    };

    var { error } = await sb.from('settlements').insert([payload]);

    saveBtn.disabled = false;
    if (error) {
      statusEl.textContent = 'Error saving: ' + error.message;
      statusEl.className = 'status-message error';
    } else {
      statusEl.textContent = 'Settlement saved.';
      statusEl.className = 'status-message success';
      loadPastSettlements();
    }
  });

  // ---------- Load past settlements ----------
  async function loadPastSettlements() {
    var container = document.getElementById('past-settlements');
    var { data, error } = await sb
      .from('settlements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      container.innerHTML = '<p class="status-message error">Could not load past settlements: ' + error.message + '</p>';
      return;
    }
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="status-message" style="color: var(--muted);">No settlements saved yet.</p>';
      return;
    }

    container.innerHTML = data.map(function (row) {
      var dateStr = row.show_date || '';
      var due = typeof row.total_due === 'number' ? money(row.total_due) : '$0.00';
      return (
        '<div class="past-entry">' +
        '<div><div class="pe-main">' + (row.artist_name || 'Untitled') + ' @ ' + (row.venue_name || 'Unknown venue') + '</div>' +
        '<div class="pe-meta">' + dateStr + (row.city ? ' · ' + row.city : '') + '</div></div>' +
        '<div class="pe-amount">' + due + '</div>' +
        '</div>'
      );
    }).join('');
  }

  loadPastSettlements();
});
