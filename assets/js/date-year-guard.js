const DATE_SELECTOR = 'input[type="date"],input[type="datetime-local"]';

function configureDateInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  if (input.type === 'date') {
    input.min = input.min || '1000-01-01';
    input.max = input.max || '9999-12-31';
  } else if (input.type === 'datetime-local') {
    input.min = input.min || '1000-01-01T00:00';
    input.max = input.max || '9999-12-31T23:59';
  }
}

function normalizeDateYear(input) {
  configureDateInput(input);
  const value = String(input.value || '');
  if (!value) return;

  // Expanded years (5 digits or more) are not accepted in this site.
  const match = value.match(/^(\d{5,})(-.+)$/);
  if (match) {
    input.value = `${match[1].slice(0, 4)}${match[2]}`;
  }

  // Keep browser validation aligned with a 4-digit year.
  if (input.validity?.rangeOverflow || input.validity?.rangeUnderflow) {
    input.setCustomValidity('年は4桁で入力してください。');
  } else {
    input.setCustomValidity('');
  }
}

function handleDateEvent(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches(DATE_SELECTOR)) return;
  normalizeDateYear(input);
}

function scanDateInputs(root = document) {
  root.querySelectorAll?.(DATE_SELECTOR).forEach(configureDateInput);
}

scanDateInputs();

document.addEventListener('focusin', handleDateEvent, true);
document.addEventListener('input', handleDateEvent, true);
document.addEventListener('change', handleDateEvent, true);
document.addEventListener('blur', handleDateEvent, true);

const observer = new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.(DATE_SELECTOR)) configureDateInput(node);
      scanDateInputs(node);
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
