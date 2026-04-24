export const CORRECTION_TAGS = Object.freeze([
  "wrong_frame",
  "wrong_intensity",
  "wrong_theory",
  "right_but_useless",
  "right_but_already_known",
  "too_generic",
  "missed_compensation",
  "assumes_facts_not_in_evidence",
  "off_by_layer",
]);

export const CORRECTION_TAG_DESCRIPTIONS = Object.freeze({
  wrong_frame: "The agent used the wrong lens entirely.",
  wrong_intensity: "The reading was too strong or too weak.",
  wrong_theory: "The causal story behind the read is incorrect.",
  right_but_useless: "Accurate but does nothing for the user.",
  right_but_already_known: "Surfaces nothing the user did not already see.",
  too_generic: "Could apply to anyone; not about this state.",
  missed_compensation: "Missed that the user is already balancing for this.",
  assumes_facts_not_in_evidence: "Projected context that isn't there.",
  off_by_layer: "Correct direction but wrong layer of the stack.",
});

export const isValidTag = (t) => t == null || CORRECTION_TAGS.includes(t);
