import AWS from 'aws-sdk';
import { getAwsConfig } from './aws-config';
import * as fs from 'fs';

const config = getAwsConfig();

const s3 = new AWS.S3({
  region: config.region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: 'v4',
});

export async function uploadAudioToS3(
  localFilePath: string,
  fileName: string
): Promise<string> {
  const fileContent = fs.readFileSync(localFilePath);
  const key = `public/audioUploads/${fileName}`;
  
  console.log(`📤 Uploading ${fileName} to S3...`);

  const params = {
    Bucket: config.s3Bucket,
    Key: key,
    Body: fileContent,
    ContentType: 'audio/mpeg',
  };

  await s3.upload(params).promise();
  
  const s3Url = `https://${config.s3Bucket}.s3.${config.region}.amazonaws.com/${key}`;
  console.log(`✅ Upload complete: ${s3Url}`);
  
  return s3Url;
}

export async function deleteAudioFromS3(s3Url: string): Promise<void> {
  // Extract key from S3 URL
  // URL format: https://bucket.s3.region.amazonaws.com/key
  const urlParts = s3Url.split('.amazonaws.com/');
  if (urlParts.length !== 2) {
    throw new Error('Invalid S3 URL format');
  }
  
  const key = urlParts[1];
  
  console.log(`🗑️ Deleting ${key} from S3...`);

  const params = {
    Bucket: config.s3Bucket,
    Key: key,
  };

  await s3.deleteObject(params).promise();
  
  console.log(`✅ Delete complete: ${key}`);
}
