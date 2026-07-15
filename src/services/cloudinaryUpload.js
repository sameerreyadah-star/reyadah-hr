/**
 * Cloudinary Upload Service
 * 
 * Uploads files to Cloudinary CDN instead of saving to local disk.
 * Cloudinary free tier: 25GB storage, 25GB monthly bandwidth — no credit card needed.
 */

const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {object} options - Upload options
 * @param {string} options.folder - Folder in Cloudinary (e.g., 'documents', 'selfies')
 * @param {string} options.publicId - Optional custom public ID (filename)
 * @param {string} options.resourceType - 'image', 'raw', 'video' (default: 'image')
 * @returns {Promise<{url: string, publicId: string, secureUrl: string}>}
 */
async function uploadBuffer(fileBuffer, options = {}) {
  const { folder = 'uploads', publicId, resourceType = 'image' } = options;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          return reject(new Error(`Cloudinary upload failed: ${error.message}`));
        }
        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
          format: result.format,
          createdAt: result.created_at,
        });
      }
    );

    // Pipe the buffer into the upload stream
    const readable = new Readable();
    readable.push(fileBuffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

/**
 * Upload a file from a local file path to Cloudinary
 * @param {string} filePath - Absolute or relative path to file
 * @param {object} options - Same as uploadBuffer options
 * @returns {Promise<{url: string, publicId: string, secureUrl: string}>}
 */
async function uploadFile(filePath, options = {}) {
  const { folder = 'uploads', publicId, resourceType = 'image' } = options;

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      public_id: publicId,
      resource_type: resourceType,
      overwrite: true,
    });

    return {
      url: result.url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
      createdAt: result.created_at,
    };
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
}

/**
 * Delete a file from Cloudinary by its public ID
 * @param {string} publicId - The public ID of the file to delete
 * @param {string} resourceType - 'image', 'raw', 'video'
 * @returns {Promise<object>}
 */
async function deleteFile(publicId, resourceType = 'image') {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    throw new Error(`Cloudinary delete failed: ${error.message}`);
  }
}

/**
 * Generate a signed URL for private files (optional, if you need access control)
 * @param {string} publicId - The public ID
 * @param {object} options - Transformation options
 * @returns {string} Signed URL
 */
function getSignedUrl(publicId, options = {}) {
  return cloudinary.url(publicId, {
    sign_url: true,
    secure: true,
    ...options,
  });
}

module.exports = {
  uploadBuffer,
  uploadFile,
  deleteFile,
  getSignedUrl,
};