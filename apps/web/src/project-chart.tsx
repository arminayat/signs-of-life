import { useId } from "react";
import { Card } from "@heroui/react";
type Point = { date: string; value: number | null; partial?: boolean };
export function ProjectChart({
  title,
  description,
  points,
  empty,
}: {
  title: string;
  description: string;
  points: Point[];
  empty: string;
}) {
  const id = useId();
  const max = Math.max(1, ...points.map((point) => point.value ?? 0));
  const ceiling = max > 4 ? Math.ceil(max / 4) * 4 : max;
  const labels = [...new Set([0, Math.ceil(ceiling / 2), ceiling])];
  const width = 660,
    height = 240,
    left = 44,
    top = 12,
    bottom = 32;
  const plotHeight = height - top - bottom;
  const step = (width - left - 12) / Math.max(1, points.length);
  const hasData = points.some((point) => point.value !== null);
  return (
    <Card className="project-chart">
      <div>
        <h2>{title}</h2>
        <p className="muted text-xs mt-1">{description}</p>
      </div>
      {hasData ? (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={id}
          >
            <title id={id}>
              {title}. Daily counts; blank dates have no available data.
            </title>
            {labels.map((label) => {
              const y = top + plotHeight * (1 - label / ceiling);
              return (
                <g key={label}>
                  <line
                    x1={left}
                    x2={width - 12}
                    y1={y}
                    y2={y}
                    className="chart-grid"
                  />
                  <text x={left - 9} y={y + 4} textAnchor="end">
                    {label}
                  </text>
                </g>
              );
            })}
            {points.map((point, index) => {
              const barHeight = ((point.value ?? 0) / ceiling) * plotHeight;
              return (
                <g key={point.date}>
                  {point.value !== null && (
                    <rect
                      x={left + index * step + 3}
                      y={top + plotHeight - Math.max(2, barHeight)}
                      width={Math.max(1, step - 6)}
                      height={Math.max(2, barHeight)}
                      rx={2}
                      className={`chart-bar ${point.partial ? "partial" : ""}`}
                    >
                      <title>
                        {point.date}: {point.value}
                        {point.partial ? " (partial reports)" : ""}
                      </title>
                    </rect>
                  )}
                  {[0, 7, 14, 21, points.length - 1].includes(index) && (
                    <text
                      x={left + (index + 0.5) * step}
                      y={height - 9}
                      textAnchor="middle"
                    >
                      {point.date.slice(5)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <details className="chart-data">
            <summary>View daily values</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.date}>
                      <td>{point.date}</td>
                      <td>
                        {point.value === null
                          ? "No data"
                          : `${point.value.toLocaleString()}${point.partial ? " (partial)" : ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="chart-empty muted">{empty}</div>
      )}
    </Card>
  );
}
