server <- function(input, output, session) {
  observeEvent(input$country, { update_country(input$country) })
  observeEvent(input$city, { update_city(input$city) })
}
