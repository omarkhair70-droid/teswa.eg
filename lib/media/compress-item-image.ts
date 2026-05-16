import { Image as ImageCompressor } from 'react-native-compressor';

export type CompressedItemImageResult = {
  uri: string;
  contentType: string;
  extension: string;
  usedCompressedOutput: boolean;
};

export async function compressItemImage(uri: string): Promise<CompressedItemImageResult> {
  try {
    const compressedUri = await ImageCompressor.compress(uri, {
      compressionMethod: 'manual',
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.82,
      output: 'jpg',
      returnableOutputType: 'uri',
    });

    if (!compressedUri || typeof compressedUri !== 'string') {
      if (__DEV__) console.warn('[compressItemImage] unusable compressed output, falling back to original');
      return { uri, contentType: '', extension: '', usedCompressedOutput: false };
    }

    return {
      uri: compressedUri,
      contentType: 'image/jpeg',
      extension: 'jpg',
      usedCompressedOutput: true,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[compressItemImage] compression failed, falling back to original', {
        message: (error as { message?: string })?.message,
      });
    }
    return { uri, contentType: '', extension: '', usedCompressedOutput: false };
  }
}
