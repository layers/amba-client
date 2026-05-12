import type { Review, ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface SubmitReviewOptions {
  item_type?: 'content_item' | 'custom';
  item_id: string;
  rating: number;
  title?: string;
  body?: string;
}

export interface UpdateReviewOptions {
  rating?: number;
  title?: string;
  body?: string;
}

export interface ReviewListOptions {
  limit?: number;
  offset?: number;
}

export interface ReviewListResult {
  reviews: Review[];
  total: number;
  avg_rating: number;
  review_count: number;
}

export class ReviewModule {
  constructor(private readonly http: HttpClient) {}

  /** Submit a review for an item. One review per user per item. */
  async submit(options: SubmitReviewOptions): Promise<Review> {
    const { data } = await this.http.post<ApiResponse<Review>>('/client/reviews', options);
    return data.data;
  }

  /** Get reviews for a specific item. */
  async getForItem(
    itemType: string,
    itemId: string,
    options: ReviewListOptions = {},
  ): Promise<ReviewListResult> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/reviews/item/${itemType}/${itemId}${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<{
      data: Review[];
      total: number;
      avg_rating: number;
      review_count: number;
    }>(path);

    return {
      reviews: data.data,
      total: data.total,
      avg_rating: data.avg_rating,
      review_count: data.review_count,
    };
  }

  /** Get all reviews by the current user. */
  async getMine(): Promise<Review[]> {
    const { data } = await this.http.get<ApiListResponse<Review>>('/client/reviews/mine');
    return data.data;
  }

  /** Update a review (must be the author). */
  async update(reviewId: string, options: UpdateReviewOptions): Promise<Review> {
    const { data } = await this.http.request<ApiResponse<Review>>(`/client/reviews/${reviewId}`, {
      method: 'PATCH',
      body: options,
    });
    return data.data;
  }

  /** Delete a review (must be the author). */
  async delete(reviewId: string): Promise<void> {
    await this.http.delete(`/client/reviews/${reviewId}`);
  }
}
