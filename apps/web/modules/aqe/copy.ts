// Copy co-located with its module (docs/ARCHITECTURE.md §9). Sourced verbatim from
// docs/modules/m2-aqe.md, which is normative for this module's content.
export const TITLE = 'Adaptive Query Execution';

export const SUMMARY =
  'The DAG rewriting itself mid-run — watch the optimiser change its mind once a stage has ' +
  'actually run and the real sizes are known.';

export const SETUP =
  'The same taxi aggregation, but the optimiser guessed wrong at planning time. Statistics ' +
  'said the dimension side was 6 GiB. After the first stage materialises, it turns out to be ' +
  '6 MiB. With AQE off, Spark honours its bad guess for the whole query.';

export const TAKEAWAY =
  'AQE does not make Spark smarter at planning time. It makes Spark willing to change its ' +
  'mind once a stage has actually run and the real sizes are known. Every one of its three ' +
  'tricks is a reaction to a statistic the planner could not have had.';
