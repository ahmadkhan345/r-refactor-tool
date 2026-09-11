compute_result <- function(x, y) {
  result <- x + y
  return(result)
}

f <- function(x, y) {
  result <- compute_result(x, y)
  print(result)
}
