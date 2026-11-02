// Package storage wraps an S3-compatible object store (Cloudflare R2 in production, MinIO locally).
package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/lms/backend/internal/config"
)

type Store struct {
	client *minio.Client
	bucket string
}

func New(ctx context.Context, cfg *config.Config) (*Store, error) {
	cl, err := minio.New(cfg.S3Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		Secure: cfg.S3UseSSL,
		Region: cfg.S3Region,
	})
	if err != nil {
		return nil, err
	}
	s := &Store{client: cl, bucket: cfg.S3Bucket}
	if cfg.S3CreateBucket {
		ok, err := cl.BucketExists(ctx, cfg.S3Bucket)
		if err != nil {
			return nil, fmt.Errorf("storage: check bucket: %w", err)
		}
		if !ok {
			if err := cl.MakeBucket(ctx, cfg.S3Bucket, minio.MakeBucketOptions{Region: cfg.S3Region}); err != nil {
				return nil, fmt.Errorf("storage: create bucket: %w", err)
			}
		}
	}
	return s, nil
}

// PresignPut returns a URL the browser can PUT the object to directly.
func (s *Store) PresignPut(ctx context.Context, key string, ttl time.Duration) (string, error) {
	u, err := s.client.PresignedPutObject(ctx, s.bucket, key, ttl)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// PresignGet returns a short-lived download URL. When download is true the browser saves the file.
func (s *Store) PresignGet(ctx context.Context, key, fileName string, download bool, ttl time.Duration) (string, error) {
	params := url.Values{}
	disp := "inline"
	if download {
		disp = "attachment"
	}
	params.Set("response-content-disposition", fmt.Sprintf("%s; filename=%q", disp, fileName))
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, ttl, params)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// Size returns the stored object's size, or an error if it does not exist.
func (s *Store) Size(ctx context.Context, key string) (int64, string, error) {
	info, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return 0, "", err
	}
	return info.Size, info.ContentType, nil
}

// Put stores an object from the server side (e.g. WhatsApp media downloaded from Meta).
func (s *Store) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

// Get opens an object for reading; the caller closes it.
func (s *Store) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	if _, err := obj.Stat(); err != nil {
		obj.Close()
		return nil, err
	}
	return obj, nil
}

func (s *Store) Remove(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

func (s *Store) Ping(ctx context.Context) error {
	_, err := s.client.BucketExists(ctx, s.bucket)
	return err
}
