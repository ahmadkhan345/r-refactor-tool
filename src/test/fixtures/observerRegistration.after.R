server <- function(input, output, session) {
  filter_sync_map <- list(
    country = update_country,
    city = update_city
  )

  for (input_name in names(filter_sync_map)) {
    local({
      nm <- input_name
      setter <- filter_sync_map[[nm]]
      observeEvent(input[[nm]], {
        setter(input[[nm]])
      })
    })
  }
}
