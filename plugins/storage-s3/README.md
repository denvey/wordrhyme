# @wordrhyme/plugin-storage-s3

S3-compatible storage provider plugin for WordRhyme CMS.

## Features

- ✅ **AWS S3** - Full support for Amazon S3
- ✅ **Cloudflare R2** - Zero egress fees
- ✅ **MinIO** - Self-hosted S3-compatible storage
- ✅ **DigitalOcean Spaces** - Simple cloud storage
- ✅ **Backblaze B2** - Cost-effective storage
- ✅ **Any S3-compatible service**

## Installation

```bash
pnpm add @wordrhyme/plugin-storage-s3
```

## Configuration

### AWS S3

```json
{
  "region": "us-east-1",
  "bucket": "my-bucket",
  "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}
```

### Cloudflare R2

```json
{
  "endpoint": "https://account-id.r2.cloudflarestorage.com",
  "region": "auto",
  "bucket": "my-bucket",
  "accessKeyId": "your-access-key-id",
  "secretAccessKey": "your-secret-access-key"
}
```

### MinIO

```json
{
  "endpoint": "https://minio.example.com",
  "region": "us-east-1",
  "bucket": "my-bucket",
  "accessKeyId": "minioadmin",
  "secretAccessKey": "minioadmin",
  "forcePathStyle": true
}
```

### With CDN

```json
{
  "region": "us-east-1",
  "bucket": "my-bucket",
  "accessKeyId": "...",
  "secretAccessKey": "...",
  "publicUrlBase": "https://cdn.example.com"
}
```

## Usage

Once installed and configured, the plugin automatically registers the S3 storage provider. You can then use it through WordRhyme's storage API:

```typescript
// Upload a file
const result = await storageService.upload({
  filename: 'example.jpg',
  mimeType: 'image/jpeg',
  content: buffer,
  storageProvider: 'plugin_storage-s3_s3', // Plugin-prefixed provider name
  isPublic: true,
});

// Download a file
const content = await storageService.download(fileId);

// Get signed URL
const url = await storageService.getUrl(fileId, {
  expiresIn: 3600, // 1 hour
});
```

## Configuration Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | No | Custom S3 endpoint (for R2, MinIO, etc.) |
| `region` | string | Yes | AWS region or 'auto' for R2 |
| `bucket` | string | Yes | S3 bucket name |
| `accessKeyId` | string | Yes | Access key ID |
| `secretAccessKey` | string | Yes | Secret access key (encrypted) |
| `publicUrlBase` | string | No | Base URL for public files (CDN) |
| `forcePathStyle` | boolean | No | Use path-style URLs (required for MinIO) |

## Features

### Multipart Upload

Supports large file uploads through S3's multipart upload API:

```typescript
// Initiate multipart upload
const uploadId = await provider.initiateMultipartUpload(key);

// Upload parts
const part1 = await provider.uploadPart(uploadId, 1, buffer1);
const part2 = await provider.uploadPart(uploadId, 2, buffer2);

// Complete upload
await provider.completeMultipartUpload(uploadId, [part1, part2]);
```

### Signed URLs

Generate temporary URLs for secure file access:

```typescript
// Get URL (download)
const downloadUrl = await provider.getSignedUrl(key, {
  expiresIn: 3600,
  operation: 'get',
});

// Put URL (upload)
const uploadUrl = await provider.getSignedUrl(key, {
  expiresIn: 3600,
  operation: 'put',
  contentType: 'image/jpeg',
});
```

### Public Files

Files can be marked as public for direct access:

```typescript
await provider.upload({
  key: 'public/image.jpg',
  content: buffer,
  contentType: 'image/jpeg',
  isPublic: true,
});
```

## Security

- ✅ Credentials stored encrypted in plugin settings
- ✅ Signed URLs for temporary access
- ✅ Public/private file access control
- ✅ Multi-tenant isolation

## Troubleshooting

### Connection Issues

If you're having trouble connecting to your S3-compatible service:

1. **Check endpoint format**: Ensure it includes `https://` and no trailing slash
2. **Verify credentials**: Test with AWS CLI or S3 client
3. **Check region**: Use `auto` for Cloudflare R2
4. **Path style**: Enable `forcePathStyle` for MinIO

### Permission Errors

Ensure your IAM user/role has these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-bucket",
        "arn:aws:s3:::my-bucket/*"
      ]
    }
  ]
}
```

## License

MIT
