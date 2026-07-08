UPDATE entries SET meta = json_remove(meta, '$.level') WHERE section IN ('skill','language') AND json_type(meta, '$.level') = 'text';
