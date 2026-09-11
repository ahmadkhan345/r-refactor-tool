server <- function(input, output, session) {
  output$orders <- renderTable({ filtered_orders() })
  output$customers <- renderTable({ filtered_customers() })
}
