# Actual probability validation status

**Production: INSUFFICIENT EVIDENCE. No numerical forward probability is released.** A provider key alone does not remove this gate. Current actual feeds lack certified historical release vintages, an independently justified cohort, contemporary unconditional baseline and empirical OOS calibration.

The implemented estimator and release thresholds are specified in [X2_PROBABILITY_AND_GRAVEYARD_SPEC.md](X2_PROBABILITY_AND_GRAVEYARD_SPEC.md). It uses a transparent Beta(1,1)-shrunk cohort frequency with chronological train/validation/holdout partitions, boundary purging, Wilson width, both-class counts, Brier/ECE/bias/baseline and drift checks. These engineering gates are not independent proof of market-case independence, stationary performance or adequate statistical power.

Regression evidence checks 0/1/50/100-case suppression, independently calculated Wilson boundary/reference values, Brier/ECE arithmetic, selected negative Graveyard denominator, overlap/duplicate/leakage exclusions, privacy-before-counts, synthetic success and deliberate drift/all-win/all-loss failure. Those are explicitly TEST fixtures. Real production resolved sample/calibration accuracy is not established and must not be substituted with fixture performance.

To validate a future release: secure actual PIT/adjustment/retention rights and evidence; freeze the registered cohort/outcome/model before evaluation; establish independence/clusters and a contemporaneous baseline; reserve untouched chronological OOS data; independently review reliability, confidence intervals, censoring and drift; publish sample dates/denominators and limitations. Until then the suppression is the correct functioning state.
