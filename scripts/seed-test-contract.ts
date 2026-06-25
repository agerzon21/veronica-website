// One-off: emit an UPDATE that fills contract_body on the test portal row,
// using sample wedding variables from the original example contract.
// Run with: npx tsx scripts/seed-test-contract.ts
// Then paste the printed SQL into the Neon SQL Editor.

import {
  WEDDING_CONTRACT_TEMPLATE,
  fillTemplate,
  type WeddingContractVariables,
} from '../src/data/contract-template';

const vars: WeddingContractVariables = {
  effective_date: 'June 25, 2026',
  photographer_name: 'Veronika Polbina',
  client_names: 'Chrisann Bryan & Rajiv Thomas',
  event_title: "Chrisann & Rajiv's Wedding",
  event_location: 'Malcolm Gross Rose Gardens',
  event_date: 'August 9, 2026',
  event_time: '5:00 PM to 6:00 PM (approximately 1 hour)',
  delivery_timeframe: 'Within 5 weeks after event',
  total_amount: '$230',
  retainer_amount: '$50',
  remaining_balance: '$180',
  balance_due_window: 'TEN (10) Days',
  payment_methods: 'Cash, Venmo, CashApp or Zelle',
  retention_months: '3',
};

const filled = fillTemplate(WEDDING_CONTRACT_TEMPLATE, vars);
const json = JSON.stringify(filled);
// Escape single quotes for SQL literal
const sqlSafe = json.replace(/'/g, "''");

console.log(`update client_portals
set contract_body = '${sqlSafe}',
    contract_total_amount = 230,
    contract_retainer_amount = 50,
    paid_to_date = 50,
    updated_at = now()
where client_email = 'test@vero.photography';`);
