localstack_violin <- function(values, labels, colors, output, axis_label) {
  populations <- levels(labels)
  samples <- lapply(populations, function(population) values[labels == population & is.finite(values)])
  densities <- lapply(samples, function(measurements) {
    if (length(measurements) < 2 || length(unique(measurements)) < 2) return(NULL)
    density(measurements, from=min(measurements), to=max(measurements), n=512)
  })
  density_max <- max(c(1e-12, unlist(lapply(densities, function(estimate) estimate$y))))
  captions <- vapply(populations, function(population) paste(strwrap(population, width=24), collapse="\n"), character(1))
  label_lines <- max(lengths(strsplit(captions, "\n", fixed=TRUE)))
  png(filename=output, width=864, height=648, pointsize=12)
  on.exit(dev.off())
  par(mar=c(min(12, 3 + label_lines), 6, 3, 2), las=1, col.axis="#334155", col.lab="#243c4b")
  limits <- range(values[is.finite(values)])
  if (diff(limits) == 0) limits <- limits + c(-0.5, 0.5)
  plot(NA, xlim=c(0.4, length(populations)+0.6), ylim=limits,
       xlab="", ylab=axis_label, xaxt="n", bty="n")
  abline(h=axTicks(2), col="#e3eaee", lwd=0.8)
  set.seed(42)
  for (position in seq_along(populations)) {
    measurements <- samples[[position]]
    if (!length(measurements)) next
    shade <- colors[(position - 1) %% length(colors) + 1]
    estimate <- densities[[position]]
    if (!is.null(estimate)) {
      widths <- 0.42 * estimate$y / density_max
      polygon(c(position-widths, rev(position+widths)), c(estimate$x, rev(estimate$x)),
              col=adjustcolor(shade, alpha.f=0.45), border=shade, lwd=1.4)
      for (quantile in quantile(measurements, c(0.25, 0.5, 0.75), names=FALSE)) {
        half_width <- approx(estimate$x, widths, xout=quantile, rule=2)$y
        segments(position-half_width, quantile, position+half_width, quantile,
                 col="#243c4b", lwd=1.3)
      }
    } else {
      segments(position-0.2, measurements[1], position+0.2, measurements[1], col=shade, lwd=2)
    }
    points(jitter(rep(position, length(measurements)), amount=0.16), measurements,
           pch=16, cex=0.65, col=adjustcolor(shade, alpha.f=0.8))
  }
  axis(1, at=seq_along(populations), labels=captions, tick=FALSE, cex.axis=0.85)
}
