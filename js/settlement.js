// ---------- Show settlement form ----------
// Live totals, deductions, merch, payout split, and saving to the Supabase "settlements" table.
// Requires /js/auth.js (window.tcscAuth) to be loaded first.
(function () {
  'use strict';

  var form = document.getElementById('settlement-form');
  if (!form) return;

  var $ = function (id) { return document.getElementById(id); };
  var deductionsList = $('deductions-list');
  var payeesList = $('payees-list');
  var splitWarning = $('payee-split-warning');
  var saveBtn = $('save-settlement');
  var saveStatus = $('save-status');
  var pastBox = $('past-settlements');
  var lastTotal = 0;

  // ---- helpers ----
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n) {
    return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function val(id) { return $(id).value; }
  function textOrNull(id) { var v = val(id).trim(); return v || null; }
  function dealType() {
    var picked = form.querySelector('input[name="deal_type"]:checked');
    return picked ? picked.value : 'guarantee';
  }
  function setStatus(box, msg, kind) {
    box.textContent = msg || '';
    box.className = 'status-message' + (kind ? ' ' + kind : '');
  }
  function make(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function fieldWrap(input) { return make('div', { class: 'field', style: 'margin:0' }, [input]); }
  function removeBtn(label) { return make('button', { type: 'button', class: 'remove-row-btn', 'aria-label': label, text: '×' }); }

  // ---- deal type: show the blocks that apply ----
  function updateDealBlocks() {
    var type = dealType();
    form.querySelectorAll('.conditional-block').forEach(function (block) {
      var types = (block.getAttribute('data-shows-for') || '').split(',');
      block.classList.toggle('is-active', types.indexOf(type) !== -1);
    });
  }

  // ---- deductions ----
  function addDeduction(label, amount) {
    var name = make('input', { type: 'text', placeholder: 'e.g. Sound tech, hospitality', 'aria-label': 'Deduction description', 'data-role': 'ded-label' });
    var amt = make('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00', 'aria-label': 'Deduction amount', 'data-role': 'ded-amount' });
    if (label) name.value = label;
    if (amount) amt.value = amount;
    var del = removeBtn('Remove deduction');
    var row = make('div', { class: 'deduction-row' }, [fieldWrap(name), fieldWrap(amt), del]);
    del.addEventListener('click', function () { row.remove(); recalc(); });
    deductionsList.appendChild(row);
    return name;
  }
  function getDeductions() {
    var out = [];
    deductionsList.querySelectorAll('.deduction-row').forEach(function (row) {
      var label = row.querySelector('[data-role="ded-label"]').value.trim();
      var amount = num(row.querySelector('[data-role="ded-amount"]').value);
      if (label || amount) out.push({ label: label || 'Deduction', amount: round2(amount) });
    });
    return out;
  }

  // ---- payees ----
  function addPayee(name, pct) {
    var who = make('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Member name', 'data-role': 'payee-name' });
    var share = make('input', { type: 'number', step: '0.01', min: '0', max: '100', placeholder: '%', 'aria-label': 'Percent of total', 'data-role': 'payee-pct' });
    if (name) who.value = name;
    if (pct !== undefined) share.value = pct;
    var amount = make('span', { class: 'payee-amount', 'data-role': 'payee-amount', text: '$0.00' });
    var del = removeBtn('Remove member');
    var row = make('div', { class: 'payee-row' }, [fieldWrap(who), fieldWrap(share), amount, del]);
    del.addEventListener('click', function () { row.remove(); updatePayees(); });
    payeesList.appendChild(row);
    return who;
  }
  function payeeRows() { return Array.prototype.slice.call(payeesList.querySelectorAll('.payee-row')); }
  function updatePayees() {
    var rows = payeeRows();
    var totalPct = 0;
    rows.forEach(function (row) {
      var pct = num(row.querySelector('[data-role="payee-pct"]').value);
      totalPct += pct;
      row.querySelector('[data-role="payee-amount"]').textContent = money(round2(lastTotal * pct / 100));
    });
    totalPct = round2(totalPct);
    if (rows.length && totalPct !== 100) {
      splitWarning.style.display = 'block';
      splitWarning.className = 'status-message error';
      splitWarning.textContent = 'Splits add up to ' + totalPct + '%. They should total 100%.';
    } else {
      splitWarning.style.display = 'none';
    }
  }
  function getPayees() {
    var out = [];
    payeeRows().forEach(function (row) {
      var name = row.querySelector('[data-role="payee-name"]').value.trim();
      var pct = num(row.querySelector('[data-role="payee-pct"]').value);
      if (name || pct) out.push({ name: name || 'Member', percent: round2(pct), amount: round2(lastTotal * pct / 100) });
    });
    return out;
  }
  function splitEvenly() {
    var rows = payeeRows();
    if (!rows.length) return;
    var base = Math.floor((100 / rows.length) * 100) / 100;
    var leftover = round2(100 - base * rows.length);
    rows.forEach(function (row, i) {
      row.querySelector('[data-role="payee-pct"]').value = i === 0 ? round2(base + leftover) : base;
    });
    updatePayees();
  }

  // ---- totals ----
  function compute() {
    var type = dealType();
    var guarantee = num(val('guarantee_amount'));
    var gross = round2(num(val('ticket_price')) * num(val('tickets_sold')));
    var artistPct = Math.min(100, Math.max(0, num(val('artist_percentage'))));
    var doorShare = round2(gross * artistPct / 100);

    var earned = type === 'guarantee' ? guarantee
      : type === 'door_split' ? doorShare
      : Math.max(guarantee, doorShare); // versus: whichever is higher

    var deductions = getDeductions();
    var totalDeductions = round2(deductions.reduce(function (s, d) { return s + d.amount; }, 0));
    var merchGross = num(val('merch_gross'));
    var merchVenuePct = Math.min(100, Math.max(0, num(val('merch_venue_percentage'))));
    var merchNet = round2(merchGross * (1 - merchVenuePct / 100));
    var deposit = num(val('deposit_paid'));
    var total = round2(earned - totalDeductions + merchNet - deposit);

    return {
      type: type, guarantee: guarantee, gross: gross, artistPct: artistPct, venuePct: round2(100 - artistPct),
      earned: round2(earned), deductions: deductions, totalDeductions: totalDeductions,
      merchGross: merchGross, merchVenuePct: merchVenuePct, merchNet: merchNet, deposit: deposit, total: total
    };
  }

  function recalc() {
    var c = compute();
    $('venue_percentage').value = c.venuePct;
    $('sum-earned').textContent = money(c.earned);
    $('sum-deductions').textContent = '–' + money(c.totalDeductions);
    $('sum-merch').textContent = '+' + money(c.merchNet);
    $('sum-deposit').textContent = '–' + money(c.deposit);
    $('sum-total').textContent = money(c.total);
    lastTotal = c.total;
    updatePayees();
  }

  // ---- save ----
  function buildRecord() {
    var c = compute();
    var usesDoor = c.type !== 'guarantee';
    var usesGuarantee = c.type !== 'door_split';
    return {
      venue_name: textOrNull('venue_name'),
      city: textOrNull('city'),
      show_date: val('show_date') || null,
      artist_name: textOrNull('artist_name'),
      promoter_name: textOrNull('promoter_name'),
      capacity: val('capacity') ? parseInt(val('capacity'), 10) : null,
      deal_type: c.type,
      guarantee_amount: usesGuarantee ? c.guarantee : null,
      ticket_price: usesDoor ? num(val('ticket_price')) : null,
      tickets_sold: usesDoor ? parseInt(val('tickets_sold') || '0', 10) : null,
      comps_issued: usesDoor ? parseInt(val('comps_issued') || '0', 10) : null,
      gross_revenue: usesDoor ? c.gross : null,
      artist_percentage: usesDoor ? c.artistPct : null,
      venue_percentage: usesDoor ? c.venuePct : null,
      deductions: c.deductions,
      total_deductions: c.totalDeductions,
      merch_gross: c.merchGross,
      merch_venue_percentage: c.merchVenuePct,
      merch_net_to_artist: c.merchNet,
      deposit_paid: c.deposit,
      total_due: c.total,
      payment_method: val('payment_method'),
      promoter_signature_name: textOrNull('promoter_signature_name'),
      artist_signature_name: textOrNull('artist_signature_name'),
      notes: textOrNull('notes'),
      payees: getPayees()
    };
  }

  function resetForm() {
    form.reset();
    deductionsList.innerHTML = '';
    payeesList.innerHTML = '';
    updateDealBlocks();
    recalc();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var sb = window.tcscAuth && window.tcscAuth.sb;
    if (!sb) { setStatus(saveStatus, 'Not connected. Refresh and try again.', 'error'); return; }
    saveBtn.disabled = true;
    setStatus(saveStatus, 'Saving…');
    sb.from('settlements').insert(buildRecord()).then(function (r) {
      saveBtn.disabled = false;
      if (r.error) { setStatus(saveStatus, 'Could not save: ' + r.error.message, 'error'); return; }
      resetForm();
      setStatus(saveStatus, 'Settlement saved.', 'success');
      loadPast();
    });
  });

  // ---- past settlements ----
  var DEAL_LABELS = { guarantee: 'Flat guarantee', door_split: 'Door split', versus: 'Guarantee vs. %' };

  function loadPast() {
    var sb = window.tcscAuth && window.tcscAuth.sb;
    if (!sb) return;
    sb.from('settlements')
      .select('id, show_date, venue_name, city, artist_name, deal_type, total_due')
      .order('show_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(25)
      .then(function (r) {
        pastBox.innerHTML = '';
        if (r.error) { pastBox.appendChild(make('p', { class: 'status-message error', text: 'Could not load past settlements: ' + r.error.message })); return; }
        if (!r.data || !r.data.length) { pastBox.appendChild(make('p', { class: 'status-message', style: 'color:var(--muted)', text: 'No settlements saved yet.' })); return; }
        r.data.forEach(function (s) {
          var where = [s.venue_name, s.city].filter(Boolean).join(', ');
          var date = s.show_date ? new Date(s.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
          pastBox.appendChild(make('div', { class: 'past-entry' }, [
            make('div', {}, [
              make('div', { class: 'pe-main', text: (s.artist_name || 'Unknown artist') + (where ? ' — ' + where : '') }),
              make('div', { class: 'pe-meta', text: date + ' · ' + (DEAL_LABELS[s.deal_type] || s.deal_type || '') })
            ]),
            make('div', { class: 'pe-amount', text: money(Number(s.total_due) || 0) })
          ]));
        });
      });
  }

  // ---- wire up ----
  form.querySelectorAll('input[name="deal_type"]').forEach(function (r) { r.addEventListener('change', function () { updateDealBlocks(); recalc(); }); });
  form.addEventListener('input', recalc);
  $('add-deduction').addEventListener('click', function () { addDeduction().focus(); });
  $('add-payee').addEventListener('click', function () { addPayee().focus(); updatePayees(); });
  $('split-evenly').addEventListener('click', splitEvenly);

  updateDealBlocks();
  recalc();

  if (window.tcscAuth) window.tcscAuth.ready.then(function (session) { if (session) loadPast(); });
})();
