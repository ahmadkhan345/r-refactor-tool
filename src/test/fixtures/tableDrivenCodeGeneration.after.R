server <- function(input, output, session) {
  table_render_map <- list(
    orders = filtered_orders,
    customers = filtered_customers
  )

  for (output_name in names(table_render_map)) {
    local({
      nm <- output_name
      getter <- table_render_map[[nm]]
      output[[nm]] <- renderTable({
        getter()
      })
    })
  }
}
