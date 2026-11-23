import { useQuery } from "@tanstack/react-query";
import { Card } from "@heroui/react";
import { Star } from "lucide-react";
import type { AppStoreListing } from "../../../packages/core/src/app-store";
import { api } from "./data";
import { ErrorNotice, External, Loading } from "./ui";
import { countryName, stateLabel } from "./app-store-format";
/** Live versions, ratings and reviews; read from Apple on request, never stored. */
export function AppStoreListingCard({
  sourceId,
  countries,
}: {
  sourceId: string;
  countries: string[];
}) {
  const query = useQuery({
    queryKey: ["app-store-listing", sourceId, countries],
    queryFn: () =>
      api<AppStoreListing>(
        `/sources/${sourceId}/app-store/listing?countries=${countries.join(",")}`,
      ),
    staleTime: 1800_000,
  });
  const listing = query.data;
  const rated = listing?.ratings.reduce((total, r) => total + r.count, 0) ?? 0;
  const average = rated
    ? listing!.ratings.reduce((total, r) => total + r.average * r.count, 0) /
      rated
    : null;
  return (
    <>
      <div className="section-heading">
        <h2>App Store</h2>
        {listing?.storeUrl && (
          <External href={listing.storeUrl}>View on the App Store</External>
        )}
      </div>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        listing && (
          <div className="stats-breakdowns">
            <Card className="stats-breakdown">
              <div>
                <h2>Versions</h2>
                <p className="muted text-xs mt-1">
                  Newest App Store versions and their review state.
                </p>
              </div>
              {listing.versions ? (
                <ul>
                  {listing.versions.map((version) => (
                    <li
                      className="breakdown-row"
                      key={`${version.platform}:${version.version}`}
                    >
                      <span className="breakdown-label">
                        {version.version}{" "}
                        <span className="muted text-xs">
                          {version.platform.replace("_", " ")} ·{" "}
                          {version.created.slice(0, 10)}
                        </span>
                      </span>
                      <span className="breakdown-value">
                        {stateLabel(version.state)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted text-sm">
                  This App Store Connect key's role can't read app versions.
                </p>
              )}
            </Card>
            <Card className="stats-breakdown">
              <div>
                <h2>Ratings</h2>
                <p className="muted text-xs mt-1">
                  Star ratings in the storefronts with the most downloads,
                  including ratings without a review.
                </p>
              </div>
              {average !== null ? (
                <>
                  <p className="rating-summary">
                    <Stars value={average} />
                    <strong>{average.toFixed(1)}</strong>
                    <span className="muted text-sm">
                      {rated.toLocaleString()} ratings
                    </span>
                  </p>
                  <ul>
                    {listing.ratings.map((rating) => (
                      <li className="breakdown-row" key={rating.country}>
                        <span className="breakdown-label">
                          {countryName(rating.country)}
                        </span>
                        <span className="breakdown-value">
                          {rating.average.toFixed(1)} ★ ·{" "}
                          {rating.count.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="muted text-sm">
                  No ratings yet in {countries.length ? "these" : "the US"}{" "}
                  storefront{countries.length === 1 ? "" : "s"}.
                </p>
              )}
            </Card>
            <Card className="stats-breakdown reviews">
              <div>
                <h2>Reviews</h2>
                <p className="muted text-xs mt-1">
                  {listing.reviews
                    ? `${listing.reviews.total.toLocaleString()} written review${listing.reviews.total === 1 ? "" : "s"}${listing.reviews.average !== null ? ` · ${listing.reviews.average.toFixed(1)} ★ average of the newest ${Math.min(200, listing.reviews.total)}` : ""}.`
                    : "Customer reviews from every storefront."}
                </p>
              </div>
              {!listing.reviews ? (
                <p className="muted text-sm">
                  This App Store Connect key's role can't read customer reviews.
                </p>
              ) : listing.reviews.latest.length ? (
                <ul>
                  {listing.reviews.latest.slice(0, 5).map((review, index) => (
                    <li key={`${review.created}:${index}`}>
                      <p className="review-heading">
                        <Stars value={review.rating} />
                        <strong>{review.title}</strong>
                      </p>
                      {review.body && (
                        <p className="review-body">{review.body}</p>
                      )}
                      <p className="muted text-xs">
                        {review.territory} · {review.created.slice(0, 10)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted text-sm">No written reviews yet.</p>
              )}
            </Card>
          </div>
        )
      )}
    </>
  );
}
function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          aria-hidden="true"
          className={value >= n - 0.25 ? "filled" : ""}
        />
      ))}
    </span>
  );
}
