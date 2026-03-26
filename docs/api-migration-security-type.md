# SecurityType API Migration Guide

## Breaking Change

The `/v1/security/init` endpoint now requires uppercase enum values for the `type` field.

## Changes Required

### Before (no longer supported):
```json
{
  "type": "stock"
}
```

### After (required):
```json
{
  "type": "STOCK"
}
```

## Valid Values

- `"STOCK"` - for stocks
- `"INDEX"` - for indices

## Migration Steps

1. Update all API calls to use uppercase values
2. Test in development environment first
3. Deploy changes before cutoff date

## Support

If you have questions, contact the development team.