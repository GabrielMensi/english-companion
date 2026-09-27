-- Vocabulary only holds what the learner wrote between [brackets]. Earlier
-- versions also saved misspelled English words ("Meaby", "wich") that some
-- models "translated"; remove those.
DELETE FROM `vocabulary`
WHERE NOT EXISTS (
  SELECT 1 FROM `messages` m
  WHERE m.`id` = `vocabulary`.`message_id`
    AND instr(lower(m.`content`), '[' || lower(`vocabulary`.`spanish`) || ']') > 0
);
