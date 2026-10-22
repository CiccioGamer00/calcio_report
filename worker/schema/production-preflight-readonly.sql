-- Read-only inventory. Run only after identifying the public Worker's DB binding.
-- Does not expose users, hashes, email addresses or purchase payloads.
SELECT type, name, tbl_name
FROM sqlite_master
WHERE type IN ('table','trigger','index')
  AND name NOT LIKE 'sqlite_%'
ORDER BY type, name;

SELECT name, type, "notnull", pk
FROM pragma_table_info('users')
ORDER BY cid;
