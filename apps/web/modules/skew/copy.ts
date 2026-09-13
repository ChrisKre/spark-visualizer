// Copy co-located with its module (docs/ARCHITECTURE.md §9). Sourced verbatim from
// docs/modules/m1-skew.md, which is normative for this module's content.
export const TITLE = 'Data skew & salting';

export const SUMMARY =
  'A stage ends when its slowest task ends — see how salting fixes a 200-partition straggler.';

export const SETUP =
  'Six months of NYC taxi trips, joined to the zone lookup, aggregated by pickup zone. ' +
  '84 million rows, 200 shuffle partitions, an 8-node cluster. The job takes six and a half ' +
  'minutes, and 199 of the 200 tasks are finished in the first nine seconds.';
